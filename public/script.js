// Helper function to get the value of a cookie and decode it
function getCookie(name) {
	const value = `; ${document.cookie}`;
	const parts = value.split(`; ${name}=`);
	if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
	return null;
}

// Extract GAME and TEAM from the URL
const urlParts = window.location.pathname.split('/');
const game = urlParts[2];  // Assuming URL structure is /play/<GAME>/<TEAM>
const teamId = urlParts[3];  // For team pages only

// Get the username from the cookie
const username = getCookie('username');

// Set the team name for team pages
if (document.getElementById('team-name')) {
	document.getElementById('team-name').textContent = teamId;
}

const wss = document.location.protocol === 'http:' ? 'ws://' : 'wss://';
let hostname = window.location.hostname;
if (hostname === '' || hostname === 'localhost') {
	hostname = hostname + ':' + document.location.port;
}

let webSocket = connect();

function connect() {
	const websocketServerUrl = `${wss}${hostname}/api/connect/${game}/${teamId}/ws`;
	const ws = new WebSocket(websocketServerUrl);

	ws.onopen = () => {
		console.log('Connected to WebSocket!');
	};

	ws.onmessage = (message) => {
		const data = JSON.parse(message.data);
		switch (data.type) {
			case 'stats':
				renderStats(data.team);
				renderTeamName(data.name);  // Render the updated team name
				renderCountryStats(data.country);  // Render the country stats
				break;
		}
	};

	ws.onclose = () => {
		console.log("Connection lost, attempting to reconnect...");
		setTimeout(() => {
			webSocket = connect();
		}, 3000);  // Reconnect after a delay
	}

	return ws;
}

// Handle LEGO block click
document.getElementById('lego-block').addEventListener('click', async () => {
	if (!username) {
		console.error('No username found in cookie');
		return;
	}
	// Send click event via WebSocket
	webSocket.send(JSON.stringify({ type: 'click', username }));
	clickSound.play();  // Play click sound
});

// Load the click sound
const clickSound = new Audio('/click.wav');

// Render team stats and update the stats list
function renderStats(teamStats) {
	const statsList = document.getElementById('stats-list');
	statsList.innerHTML = '';  // Clear the existing stats

	teamStats.forEach((stat) => {
		let listItem = document.querySelector(`li[data-username="${stat.username}"]`);

		if (!listItem) {
			listItem = document.createElement('li');
			listItem.dataset.username = stat.username;
			statsList.appendChild(listItem);
		}

		listItem.dataset.clicks = stat.clicks;
		listItem.textContent = `${stat.username}: ${stat.clicks} clicks`;

		// Highlight the user's entry if the username matches
		if (stat.username === username) {
			listItem.classList.add('highlight');  // Add highlight class to user
		} else {
			listItem.classList.remove('highlight');
		}
	});
}

// Render team name
function renderTeamName(teamName) {
	const teamNameElement = document.getElementById('team-name');
	teamNameElement.textContent = teamName;  // Update the team name with the new value
}

// Render stats by country
function renderCountryStats(countryStats) {
	const countryStatsList = document.getElementById('country-stats-list');
	countryStatsList.innerHTML = '';  // Clear the existing country stats

	// Display stats by country
	countryStats.forEach((countryStat) => {
		const listItem = document.createElement('li');
		listItem.textContent = `${countryStat.country}: ${countryStat.clicks} clicks`;
		countryStatsList.appendChild(listItem);
	});
}
