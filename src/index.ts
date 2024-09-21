import { Hono } from 'hono';
import { DurableObject } from 'cloudflare:workers';
import { validator } from 'hono/validator';
import { getCookie, setCookie } from 'hono/cookie';
import teamHtml from './team.html';
import leaderboardHtml from './leaderboard.html';

const app = new Hono<{ Bindings: Env }>();
// TODO: idFromName this?
const CURRENT_GAME = 'builderday';
// Ten seconds
const ALARM_TIME = 10 * 1000;

type Stats = {
	username: string;
	clickCount: number;
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
    			id INTEGER PRIMARY KEY AUTOINCREMENT,
    			name TEXT NOT NULL DEFAULT 'tbd',
    			full INTEGER NOT NULL DEFAULT 0 CHECK (full IN (0, 1)),
				total_clicks INTEGER NOT NULL DEFAULT 0,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);`);
		ctx.storage.setAlarm(Date.now() + ALARM_TIME);
	}

	async addPlayerToAvailableTeam(username: string, country: string | unknown) {
		// Find team that isn't full
		let teamId = null;
		while (teamId === null) {
			const cursor = this.sql.exec(`SELECT * FROM teams WHERE full = 0`);
			const first = [...cursor][0];
			if (first !== undefined) {
				teamId = first.id;
				break;
			}
			// If there aren't any, create more by inserting team rows
			// Adds a new team for consideration
			this.sql.exec('INSERT INTO teams DEFAULT VALUES');
		}
		if (teamId === undefined || typeof teamId !== 'number') {
			throw new Error('Could not get team created');
		}
		// Add player
		const teamStub = await this.getTeamStub(teamId);
		// TODO: Is there a cleaner way to do this?
		await teamStub.setTeamId(CURRENT_GAME, teamId);
		await teamStub.addPlayer(username, country);
		// Get count, if full, mark as full
		const playerCount = await teamStub.getPlayerCount();
		if (playerCount >= this.MAX_PLAYERS) {
			this.sql.exec(`UPDATE teams SET full=1 WHERE id=?`, teamId);
		}
		// Return the team id
		return teamId;
	}

	async getTeamStub(teamId: string | number): Promise<DurableObjectStub<Team>> {
		const id: DurableObjectId = this.env.TEAM.idFromName(`${CURRENT_GAME}/${teamId}`);
		return this.env.TEAM.get(id);
	}

	async renameFullTeams() {
		console.log('Running renameFullTeams');
		const cursor = this.sql.exec(`SELECT * FROM teams WHERE name='tbd' AND full=1`);
		for (const row of cursor) {
			// Get Team
			if (typeof row.id !== 'number') {
				console.log(`Row id was ${row.id}. Expected number`);
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

						Return only the name, do not include an introduction or prefix, just the name.
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

	async setTotalClicks(teamId: number, clickCount: number) {
		this.sql.exec(`UPDATE teams SET total_clicks=? WHERE id=?`, teamId, clickCount);
		return true;
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

	async setTeamId(gameId: string, teamId: number) {
		await this.ctx.storage.put("gameId", gameId);
		await this.ctx.storage.put("teamId", teamId);
		return true;
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
		const cursor = this.sql.exec('SELECT count(*) as totalClickCount FROM clicks');
		const count = [...cursor][0].clickCount;
		if (!count || typeof count !== "number") {
			return 0
		}
		return count;
	}

	async getStats(): Promise<Stats[]> {
		const stats: Stats[] = [];
		const cursor = this.sql.exec(`SELECT username, count(*) as clickCount from clicks GROUP BY 1 ORDER BY clickCount DESC`);
		for (const row of cursor) {
			if (typeof row.username === 'string' && typeof row.clickCount === 'number') {
				stats.push({
					username: row.username,
					clickCount: row.clickCount,
				});
			}
		}
		return stats;
	}

	async reportInfo() {
		const teamId = await this.ctx.storage.get("teamId");
		if (!teamId || typeof teamId !== "number") {
			console.error("Team ID is not found");
			return;
		}
		const gameId = await this.ctx.storage.get("gameId");
		if (!gameId || typeof gameId !== "string") {
			console.error("Game ID is not found");
			return;
		}
		const id = this.env.GAME.idFromName(gameId);
		const gameStub = this.env.GAME.get(id);
		const clickCount = await this.getTotalClickCount();
		await gameStub.setTotalClicks(teamId, clickCount);
	}

	async alarm() {
		console.log("Team alarm triggered");
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
		const { username } = await c.req.valid('form');
		const country = c.req.raw.cf?.country;
		// Get the game
		const id: DurableObjectId = c.env.GAME.idFromName(CURRENT_GAME);
		const gameStub = c.env.GAME.get(id);
		// Add the player
		const teamId = await gameStub.addPlayerToAvailableTeam(username, country);
		// Set a cookie
		setCookie(c, 'username', username);
		// Redirect to the team page using pathy
		const playUrl = `/play/${CURRENT_GAME}/${teamId}`;
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
	const id: DurableObjectId = c.env.TEAM.idFromName(`${game}/${teamId}`);
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
	const id: DurableObjectId = c.env.TEAM.idFromName(`${game}/${teamId}`);
	const teamStub = c.env.TEAM.get(id);
	const stats = await teamStub.getStats();
	return c.json({ results: stats });
});

export default app;
/**
 * This is the standard fetch handler for a Cloudflare Worker
 *
 * @param request - The request submitted to the Worker from the client
 * @param env - The interface to reference bindings declared in wrangler.toml
 * @param ctx - The execution context of the Worker
 * @returns The response to be sent back to the client
 */
// 	async fetch(request, env, ctx): Promise<Response> {
// 		// We will create a `DurableObjectId` using the pathname from the Worker request
// 		// This id refers to a unique instance of our 'MyDurableObject' class above
// 		let id: DurableObjectId = env.MY_DURABLE_OBJECT.idFromName(new URL(request.url).pathname);

// 		// This stub creates a communication channel with the Durable Object instance
// 		// The Durable Object constructor will be invoked upon the first call for a given id
// 		let stub = env.MY_DURABLE_OBJECT.get(id);

// 		// We call the `sayHello()` RPC method on the stub to invoke the method on the remote
// 		// Durable Object instance
// 		let greeting = await stub.sayHello('world');

// 		return new Response(greeting);
// 	},
// } satisfies ExportedHandler<Env>;
