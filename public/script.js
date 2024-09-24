// utils.js (Assuming this is included before script.js)
// Helper function to get the value of a cookie and decode it
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
    return null;
}

// Extract GAME and TEAM from the URL
const urlParts = window.location.pathname.split('/');
// Assuming URL structure is /play/<GAME>/<TEAM>
const game = urlParts[2];
const teamId = urlParts[3];

// Get the username from the cookie
const username = getCookie('username');

// Set the team name for team pages
const teamNameElement = document.getElementById('team-name');
if (teamNameElement) {
    teamNameElement.textContent = teamId;
}

// Determine WebSocket protocol
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsHost = window.location.host;

let webSocket = connect();

function connect() {
    const websocketServerUrl = `${wsProtocol}//${wsHost}/api/connect/${game}/${teamId}/ws`;
    const ws = new WebSocket(websocketServerUrl);

    ws.onopen = () => {
        console.log('Connected to WebSocket!');
    };

    ws.onmessage = (message) => {
        try {
            const data = JSON.parse(message.data);
            switch (data.type) {
                case 'stats':
                    renderStats(data.team);
                    renderTeamName(data.name);
                    renderCountryStats(data.country);
                    break;
                default:
                    console.warn(`Unhandled message type: ${data.type}`);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    };

    ws.onclose = () => {
        console.log('Connection lost, attempting to reconnect...');
        reconnectAttempts = 0;
        attemptReconnect();
    };

    return ws;
}

let reconnectAttempts = 0;
const maxReconnectAttempts = 10;

function attemptReconnect() {
    if (reconnectAttempts < maxReconnectAttempts) {
        const timeout = Math.pow(2, reconnectAttempts) * 1000; // Exponential backoff
        setTimeout(() => {
            reconnectAttempts++;
            console.log(`Reconnection attempt ${reconnectAttempts}`);
            webSocket = connect();
        }, timeout);
    } else {
        console.error('Max reconnection attempts reached. Please refresh the page.');
        alert('Connection lost. Please refresh the page to continue.');
    }
}

// Handle LEGO block click
const legoBlock = document.getElementById('lego-block');
if (legoBlock) {
    legoBlock.setAttribute('tabindex', '0'); // Make it focusable

    // Click event
    let canClick = true;
    const clickCooldown = 200; // milliseconds

    legoBlock.addEventListener('click', () => {
        if (!canClick) return;
        canClick = false;

        if (!username) {
            alert('Please log in to continue playing.');
            window.location.href = '/login';
            return;
        }
        webSocket.send(JSON.stringify({ type: 'click', username }));
        clickSound.play();

        // Visual feedback
        legoBlock.classList.add('clicked');
        setTimeout(() => {
            legoBlock.classList.remove('clicked');
            canClick = true;
        }, clickCooldown);
    });

    // Keyboard interaction
    legoBlock.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            legoBlock.click();
        }
    });
}

// Load the click sound
const clickSound = new Audio('/click.wav');

// Render team stats and update the stats list
function renderStats(teamStats) {
    const statsList = document.getElementById('stats-list');
    if (!statsList) return;
    statsList.innerHTML = ''; // Clear the existing stats

    // Sort teamStats by clicks in descending order
    teamStats.sort((a, b) => b.clicks - a.clicks);

    teamStats.forEach((stat) => {
        const listItem = document.createElement('li');
        listItem.dataset.username = stat.username;
        listItem.textContent = `${stat.username}: ${stat.clicks} clicks`;

        // Highlight the user's entry if the username matches
        if (stat.username === username) {
            listItem.classList.add('highlight'); // Add highlight class to user
        }

        statsList.appendChild(listItem);
    });
}

// Render team name
function renderTeamName(teamName) {
    const teamNameElement = document.getElementById('team-name');
    if (teamNameElement) {
        teamNameElement.textContent = teamName;
    }
}

// Render stats by country
function renderCountryStats(countryStats) {
    const countryStatsList = document.getElementById('country-stats-list');
    if (!countryStatsList) return;
    countryStatsList.innerHTML = ''; // Clear the existing country stats

    // Sort countryStats by clicks in descending order
    countryStats.sort((a, b) => b.clicks - a.clicks);

    countryStats.forEach((countryStat) => {
        const listItem = document.createElement('li');
        listItem.textContent = `${countryStat.country}: ${countryStat.clicks} clicks`;
        countryStatsList.appendChild(listItem);
    });
}
