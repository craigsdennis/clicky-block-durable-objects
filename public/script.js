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
const websocketServerUrl = `${wss}${hostname}/api/connect/${game}/${teamId}/ws`;
const ws = new WebSocket(websocketServerUrl);

ws.onopen = () => {
	console.log('Opening!');
};

ws.onmessage = (message) => {
	const data = JSON.parse(message.data);
	switch (data.type) {
		case "stats":
			renderStats(data.stats);
			break;
	}
}

document.getElementById('lego-block').addEventListener('click', async () => {
	if (!username) {
		console.error('No username found in cookie');
		return;
	}
	ws.send(JSON.stringify({type: "click", username}));
	clickSound.play();
});

// Load the click sound
const clickSound = new Audio('/click.wav');

function renderStats(stats) {
	const statsList = document.getElementById('stats-list');
	statsList.innerHTML = ''; // Clear the existing stats

	stats.forEach(stat => {
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
			listItem.classList.add('highlight'); // Add highlight class to user
		} else {
			listItem.classList.remove('highlight');
		}
	});
}

