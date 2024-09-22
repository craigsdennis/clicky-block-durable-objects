import { Hono } from 'hono';
import { DurableObject } from 'cloudflare:workers';
import { validator } from 'hono/validator';
import { getCookie, setCookie } from 'hono/cookie';
// @ts-ignore
import teamHtml from './team.html';
// @ts-ignore
import leaderboardHtml from './leaderboard.html';

const app = new Hono<{ Bindings: Env }>();
const CURRENT_GAME = 'builderday';
// Ten seconds
const ALARM_TIME = 10 * 1000;

type Stats = {
	username: string;
	clicks: number;
};

type Player = {
	username: string;
	country: string;
};

export class Game extends DurableObject {
	sql: SqlStorage;
	env: Env;
	MAX_PLAYERS = 3;
	storage: DurableObjectStorage;
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.env = env;
		this.storage = ctx.storage;
		this.sql = ctx.storage.sql;
		this.sql.exec(`
			CREATE TABLE IF NOT EXISTS teams (
    			id TEXT PRIMARY KEY,
    			name TEXT NOT NULL DEFAULT 'tbd',
    			full INTEGER NOT NULL DEFAULT 0 CHECK (full IN (0, 1)),
				total_clicks INTEGER NOT NULL DEFAULT 0,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);`);
		ctx.storage.setAlarm(Date.now() + ALARM_TIME);
	}

	async getName(): Promise<string | undefined> {
		return await this.storage.get("name");
	}

	async setName(name: string) {
		return this.storage.put("name", name);
	}

	async addPlayerToAvailableTeam(username: string, country: string | unknown): Promise<String> {
		// Find team that isn't full
		let teamId: DurableObjectId | undefined = undefined;
		while (teamId === undefined) {
			const cursor = this.sql.exec(`SELECT * FROM teams WHERE full = 0`);
			const first = [...cursor][0];
			if (first !== undefined) {
				if (first.id && typeof first.id === "string") {
					teamId = this.env.TEAM.idFromString(first.id);
					break;
				}
			}
			// If there aren't any, create more by inserting team rows
			// Adds a new team for consideration
			teamId = this.env.TEAM.newUniqueId();
			this.sql.exec('INSERT INTO teams (id) VALUES (?)', teamId.toString());
		}
		if (teamId === undefined) {
			throw new Error('Could not get team created');
		}
		// Add player
		const teamStub = this.env.TEAM.get(teamId);
		const gameName = (await this.getName()) || CURRENT_GAME;
		await teamStub.setGameName(gameName);
		await teamStub.addPlayer(username, country);
		// Get count, if full, mark as full
		const playerCount = await teamStub.getPlayerCount();
		if (playerCount >= this.MAX_PLAYERS) {
			this.sql.exec(`UPDATE teams SET full=1 WHERE id=?`, teamId.toString());
		}
		// Return the team id
		return teamId.toString();
	}

	async getTeamStub(teamIdString: string): Promise<DurableObjectStub<Team>> {
		const id: DurableObjectId = this.env.TEAM.idFromString(teamIdString);
		return this.env.TEAM.get(id);
	}

	async renameFullTeams() {
		console.log('Running renameFullTeams');
		const cursor = this.sql.exec(`SELECT * FROM teams WHERE name='tbd' AND full=1`);
		for (const row of cursor) {
			// Get Team
			if (typeof row.id !== 'string') {
				console.log(`Row id was ${row.id}. Expected string`);
				continue;
			}
			const teamStub = await this.getTeamStub(row.id);
			// Get Player Info
			const info = await teamStub.getPlayerInfo();
			// Run AI to generate name
			const results = await this.env.AI.run("@cf/meta/llama-3-8b-instruct", {
				messages: [
					{role: "system", content: `You are a team name generator for a game called Clicky Block.

						The user is going to give you context about the team members.

						Your job is create a new creative fun team name based on the makeup of the team.

						Ensure to incorporate their names an their locations in the creative process.

						Return only the team name, do not include an introduction or prefix, just the team name.
						`},
					{role: "user", content: JSON.stringify(info)}
				],
			}, {
				gateway: {
					id: "clicky-block",
					skipCache: true
				}
			});
			// @ts-ignore: Why no response?
			const teamName = results.response;
			console.log("Updating team name:", teamName);
			// Update team name
			this.sql.exec(`UPDATE teams SET name=? WHERE id=?`, teamName, row.id);
		}
	}

	async setTotalClicks(teamIdString: string, clickCount: number) {
		this.sql.exec(`UPDATE teams SET total_clicks=? WHERE id=?`, clickCount, teamIdString);
		return true;
	}

	async leaderboard() {
		const leaderboard = [];
		const cursor = this.sql.exec('SELECT * FROM teams ORDER BY total_clicks DESC');
		for (const row of cursor) {
			leaderboard.push({
				name: row.name,
				teamId: row.id,
				clicks: row.total_clicks
			});
		}
		return leaderboard;
	}

	async alarm() {
		console.log('Game Alarm triggered');
		await this.renameFullTeams();
		// Reset the alarm
		this.storage.setAlarm(Date.now() + ALARM_TIME);
	}
}

export class Team extends DurableObject {
	sql: SqlStorage;
	env: Env;
	storage: DurableObjectStorage;
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.env = env;
		this.storage = ctx.storage;
		this.sql = ctx.storage.sql;
		this.sql.exec(`
			CREATE TABLE IF NOT EXISTS players(
				username TEXT NOT NULL,
				country TEXT NOT NULL,
			    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);`);
		this.sql.exec(`
			CREATE TABLE IF NOT EXISTS clicks(
				username TEXT NOT NULL,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);`);
		this.storage.setAlarm(Date.now() + ALARM_TIME);
	}

	async setGameName(gameName: string) {
		return this.storage.put("gameName", gameName);
	}

	async getGameStub(): Promise<DurableObjectStub<Game>> {
		const name: string = (await this.storage.get("gameName")) || CURRENT_GAME;
		const id = this.env.GAME.idFromName(name);
		return this.env.GAME.get(id);
	}

	async addPlayer(username: string, country: string | unknown): Promise<boolean> {
		this.sql.exec(`INSERT INTO players (username, country) VALUES (?, ?);`, username, country);
		return true;
	}

	async getPlayerCount(): Promise<number> {
		const cursor = this.sql.exec(`SELECT count(*) as playerCount FROM players;`);
		const first = [...cursor][0];
		if (typeof first.playerCount !== 'number') {
			return 0;
		}
		return first.playerCount;
	}

	async clickBlock(username: string): Promise<boolean> {
		this.sql.exec(`INSERT INTO clicks (username) VALUES (?);`, username);
		return true;
	}

	async getPlayerInfo(): Promise<Player[]> {
		const players: Player[] = [];
		const cursor = this.sql.exec(`SELECT * FROM players;`);
		for (const row of cursor) {
			if (typeof row.username === 'string' && typeof row.country === 'string') {
				players.push({ username: row.username, country: row.country });
			}
		}
		return players;
	}

	async getTotalClickCount(): Promise<number> {
		const cursor = this.sql.exec('SELECT count(*) as clickCount FROM clicks');
		const count = [...cursor][0].clickCount;
		if (!count || typeof count !== "number") {
			return 0
		}
		return count;
	}

	async getStats(): Promise<Stats[]> {
		const stats: Stats[] = [];
		const cursor = this.sql.exec(`SELECT username, count(*) as clickCount from clicks GROUP BY username ORDER BY clickCount DESC`);
		for (const row of cursor) {
			if (typeof row.username === 'string' && typeof row.clickCount === 'number') {
				stats.push({
					username: row.username,
					clicks: row.clickCount,
				});
			}
		}
		return stats;
	}

	async reportInfo() {
		console.log(`Reporting info`);
		const clickCount = await this.getTotalClickCount();
		const gameStub = await this.getGameStub();
		const teamIdString = this.ctx.id.toString();
		await gameStub.setTotalClicks(teamIdString, clickCount);
	}

	async alarm() {
		console.log("Team Alarm triggered");
		await this.reportInfo();
		this.storage.setAlarm(Date.now() + ALARM_TIME);
	}
}

app.post(
	'/join',
	validator('form', (value, c) => {
		const username = value['username'];
		if (!username || typeof username !== 'string') {
			return c.text('Missing username!', 400);
		}
		return { username };
	}),
	async (c) => {
		// Use a form
		const { username } = c.req.valid('form');
		const country = c.req.raw.cf?.country;
		// Get the game
		const id: DurableObjectId = c.env.GAME.idFromName(CURRENT_GAME);
		const gameStub = c.env.GAME.get(id);
		// TODO: This is dorky on initialize
		const name = await gameStub.getName();
		if (name === undefined) {
			await gameStub.setName(CURRENT_GAME);
		}
		// Add the player
		const teamIdString: string = await gameStub.addPlayerToAvailableTeam(username, country);
		// Set a cookie
		setCookie(c, 'username', username);
		setCookie(c, 'teamId', teamIdString);
		// Redirect to the team page using pathy
		const playUrl = `/play/${CURRENT_GAME}/${teamIdString}`;
		return c.redirect(playUrl, 302);
	}
);

app.get('/play/:game/:teamId', async (c) => {
	const username = getCookie(c, 'username');
	if (username === undefined) {
		// Redirect to join if no cookie
		console.log('Missing username');
		return c.redirect('/');
	}
	// TODO: Validate the GAME and TEAM?
	return c.html(teamHtml);
});

app.get('/leaderboard/:game', async (c) => {
	return c.html(leaderboardHtml);
});

app.post('/api/click/:game/:teamId', async (c) => {
	const { game, teamId } = c.req.param();
	const id: DurableObjectId = c.env.TEAM.idFromString(teamId);
	const teamStub = c.env.TEAM.get(id);
	const username = getCookie(c, 'username');
	if (!username || typeof username !== 'string') {
		return c.json({ success: false, message: 'Bad Username' }, 400);
	}
	const success = await teamStub.clickBlock(username);
	return c.json({ success });
});

app.get('/api/stats/:game/:teamId', async (c) => {
	const { game, teamId } = c.req.param();
	const id: DurableObjectId = c.env.TEAM.idFromString(teamId);
	const teamStub = c.env.TEAM.get(id);
	const stats = await teamStub.getStats();
	return c.json({ results: stats });
});

app.get('/api/leaderboard/:game', async (c)=> {
	const {game} = c.req.param();
	const id = c.env.GAME.idFromName(game);
	const gameStub = c.env.GAME.get(id);
	const leaderboard = await gameStub.leaderboard();
	return c.json({results: leaderboard});
})

export default app;
