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

	async addPlayerToAvailableTeam(username: string, country: string | unknown) {
		// Find team that isn't full
		let teamId: string | undefined = undefined;
		while (teamId === undefined) {
			const cursor = this.sql.exec(`SELECT * FROM teams WHERE full = 0 LIMIT 1;`);
			const first = [...cursor][0];
			if (first !== undefined) {
				if (first.id && typeof first.id === 'string') {
					teamId = first.id;
					break;
				}
			}
			// If there aren't any, create more by inserting team rows
			// Adds a new team for consideration
			teamId = crypto.randomUUID();
			this.sql.exec('INSERT INTO teams (id) VALUES (?)', teamId);
		}
		if (teamId === undefined) {
			throw new Error('Could not get team created');
		}
		// Add player
		const teamStub = await this.getTeamStub(teamId);
		// Username's are unique
		const safeUsername = await teamStub.getSafeUsername(username);
		await teamStub.addPlayer(safeUsername, country);
		const name = this.sql.exec(`SELECT name FROM teams where id=?`, teamId).raw().next().value[0];
		await teamStub.setName(name);
		// Get count, if full, mark as full
		const playerCount = await teamStub.getPlayerCount();
		if (playerCount >= this.MAX_PLAYERS) {
			this.sql.exec(`UPDATE teams SET full=1 WHERE id=?`, teamId);
		}
		// Return the team id
		return { safeUsername, teamId };
	}

	async getTeamStub(teamId: string): Promise<DurableObjectStub<Team>> {
		const id: DurableObjectId = this.env.TEAM.idFromName(teamId);
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
			const results = await this.env.AI.run(
				'@cf/meta/llama-3.1-8b-instruct',
				{
					messages: [
						{
							role: 'system',
							content: `You are a team name generator for a game called Clicky Block.

						The user is going to give you context about the team members.

						Your job is create a new creative fun team name based on the makeup of the team.

						Ensure to incorporate their names an their locations in the creative process.

						Return only the team name, do not include an introduction or prefix, just the team name.
						`,
						},
						{ role: 'user', content: JSON.stringify(info) },
					],
				},
				{
					gateway: {
						id: 'clicky-block',
						skipCache: true,
					},
				}
			);
			// @ts-ignore: Why no response?
			const teamName = results.response;
			console.log('Updating team name:', teamName);
			// Update team name
			this.sql.exec(`UPDATE teams SET name=? WHERE id=?`, teamName, row.id);
			await teamStub.setName(teamName);
		}
	}

	async gatherAggregateClicks() {
		console.log(`Gathering aggregate data`);
		const cursor = this.sql.exec(`SELECT id FROM teams`);
		const promises = [...cursor].map(async (row) => {
			if (row.id && typeof row.id === 'string') {
				const teamStub = await this.getTeamStub(row.id);
				const totalClickCount = await teamStub.getTotalClickCount();
				this.sql.exec(`UPDATE teams SET total_clicks=? WHERE id=?`, totalClickCount, row.id);
				return true;
			}
		});
		return Promise.allSettled(promises);
	}

	async leaderboard() {
		const leaderboard = [];
		const cursor = this.sql.exec('SELECT * FROM teams ORDER BY total_clicks DESC');
		for (const row of cursor) {
			leaderboard.push({
				name: row.name,
				teamId: row.id,
				clicks: row.total_clicks,
			});
		}
		return leaderboard;
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
				username TEXT NOT NULL UNIQUE,
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

	async setName(name: string) {
		await this.storage.put('name', name);
	}

	async getName() {
		return this.storage.get('name');
	}

	async getSafeUsername(username: string): Promise<string> {
		const cursor = this.sql.exec(`SELECT count(*) FROM players WHERE username=?`, username);
		if (cursor.raw().next().value[0] === 0) {
			return username;
		}
		const fixCursor = this.sql.exec(`SELECT count(*) FROM players WHERE username LIKE ?`, `${username} (%`);
		const fixNameCount = fixCursor.raw().next().value[0];
		const fixes = ['the second', 'the third', 'the fourth', 'the fifth'];
		return `${username} (${fixes[fixNameCount]})`;
	}

	async addPlayer(username: string, country: string | unknown): Promise<boolean> {
		this.sql.exec(`INSERT INTO players (username, country) VALUES (?, ?);`, username, country);
		return true;
	}

	async getPlayerCount(): Promise<number> {
		const cursor = this.sql.exec(`SELECT count(*) as playerCount FROM players;`);
		return cursor.raw().next().value[0];
	}

	async clickBlock(username: string): Promise<boolean> {
		const cursor = this.sql.exec(`INSERT INTO clicks (username) VALUES (?);`, username);
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
		if (!count || typeof count !== 'number') {
			return 0;
		}
		return count;
	}

	async getStats() {
		const stats = [];
		const cursor = this.sql.exec(`SELECT username, count(*) as clickCount FROM clicks GROUP BY username ORDER BY clickCount DESC`);
		for (const row of cursor) {
			stats.push({
				username: row.username,
				clicks: row.clickCount,
			});
		}
		return stats;
	}

	async getCountryStats() {
		const cursor = this.sql.exec(`SELECT * FROM players ORDER BY country`);
		const stats: { [key: string]: number } = {};
		for (const row of cursor) {
			const country: string = row.country as string;
			stats[country] = stats[country] || 0;
			stats[country] += this.sql.exec(`SELECT count(*) FROM clicks WHERE username=?`, row.username).raw().next().value[0];
		}
		const statsArray = Object.keys(stats).map((country) => ({
			country,
			clicks: stats[country],
		}));

		// Step 2: Sort the array in descending order of clicks
		const sortedArray = statsArray.sort((a, b) => b.clicks - a.clicks);
		return sortedArray;
	}

	async fetch() {
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		this.ctx.acceptWebSocket(server);

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void | Promise<void> {
		const msg = JSON.parse(message as string);
		switch (msg.type) {
			case 'click':
				await this.clickBlock(msg.username);
				break;
		}
		// Always broadcast stats
		const teamStats = await this.getStats();
		const countryStats = await this.getCountryStats();
		const name = await this.getName();
		this.ctx.getWebSockets().forEach((server) => {
			server.send(
				JSON.stringify({
					type: 'stats',
					name,
					team: teamStats,
					country: countryStats,
				})
			);
		});
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
		console.log(`Client WebSocket Closed - ${code}: ${reason} ${wasClean}`);
		console.log('Closing server');
		ws.close();
	}
}

export class Aggregator extends DurableObject {
	env: Env;
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.env = env;
		this.ctx.storage.setAlarm(Date.now() + ALARM_TIME);
	}

	async setName(name: string) {
		await this.ctx.storage.put('name', name);
	}

	async getName() {
		return this.ctx.storage.get('name');
	}

	async alarm(): Promise<void> {
		console.log('Aggregator Alarm triggered');
		const gameName: string = (await this.getName()) as string;
		const id = this.env.GAME.idFromName(gameName);
		const gameStub = this.env.GAME.get(id);
		await gameStub.renameFullTeams();
		await gameStub.gatherAggregateClicks();
		// Reset the alarm
		this.ctx.storage.setAlarm(Date.now() + ALARM_TIME);
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
		const aggregatorId = c.env.AGGREGATOR.idFromName(CURRENT_GAME);
		const aggregatorStub = c.env.AGGREGATOR.get(aggregatorId);
		await aggregatorStub.setName(CURRENT_GAME);
		// Add the player
		const { safeUsername, teamId } = await gameStub.addPlayerToAvailableTeam(username, country);
		// Set a cookie
		setCookie(c, 'username', safeUsername);
		setCookie(c, 'teamId', teamId);
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

app.get('/api/connect/:game/:teamId/ws', async (c) => {
	const { teamId } = c.req.param();
	const id = c.env.TEAM.idFromName(teamId);
	const teamStub = c.env.TEAM.get(id);
	return teamStub.fetch(c.req.raw);
});

app.get('/api/leaderboard/:game', async (c) => {
	const { game } = c.req.param();
	const id = c.env.GAME.idFromName(game);
	const gameStub = c.env.GAME.get(id);
	const leaderboard = await gameStub.leaderboard();
	return c.json({ results: leaderboard });
});

export default app;
