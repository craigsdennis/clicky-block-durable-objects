// script.js

// Ensure utils.js is included before this script in your HTML to use getCookie

// Get 'username' and 'teamId' from cookies
const username = getCookie('username');
const teamId = getCookie('teamId');

// Extract 'game' from the URL
const urlParts = window.location.pathname.split('/');
// Assuming URL structure is /team/<GAME>
const game = urlParts[2];

// Establish WebSocket connection, including teamId in the URL
const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const wsUrl = `${wsProtocol}://${window.location.host}/api/connect/${game}/${teamId}/ws`;
const ws = new WebSocket(wsUrl);

// Handle WebSocket events
ws.onopen = () => {
    console.log('Connected to WebSocket!');
    // Send a "hello" message when the WebSocket is ready
    if (username) {
        ws.send(JSON.stringify({ type: 'hello', username }));
    } else {
        console.warn('Username is not set. Hello message not sent.');
    }
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
            // Handle other message types if necessary
            default:
                console.warn(`Unhandled message type: ${data.type}`);
        }
    } catch (error) {
        console.error('Error parsing message:', error);
    }
};

// Click handling
const legoBlock = document.getElementById('lego-block');
let canClick = true;
const clickCooldown = 50; // milliseconds

const clickSound = new Audio('/click.wav'); // Ensure this file exists

legoBlock.addEventListener('click', () => {
    if (!canClick) return;
    canClick = false;

    if (!username) {
        alert('Please log in to continue playing.');
        window.location.href = '/login';
        return;
    }
    ws.send(JSON.stringify({ type: 'click', username }));
    clickSound.play();

    // Visual feedback
    legoBlock.classList.add('clicked');
    setTimeout(() => {
        legoBlock.classList.remove('clicked');
        canClick = true;
    }, clickCooldown);
});

// Rendering functions
function renderStats(teamStats) {
    const statsList = document.getElementById('stats-list');
    if (!statsList) return;

    statsList.innerHTML = ''; // Clear existing stats

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
        const flagEmoji = countryCodeToFlagEmoji(countryStat.country);
        listItem.textContent = `${flagEmoji} ${countryStat.country}: ${countryStat.clicks} clicks`;
        countryStatsList.appendChild(listItem);
    });
}

// Function to fetch and update the placement message
async function fetchPlacement() {
    try {
        const response = await fetch(`/api/leaderboard/placement/${game}/${teamId}`);
        if (!response.ok) {
            throw new Error(`Network response was not ok (${response.statusText})`);
        }
        const data = await response.json();
        const placement = data.placement;
        const totalCount = data.totalCount;

        // Update the placement message
        updatePlacementMessage(placement, totalCount);
    } catch (error) {
        console.error('Failed to fetch placement data:', error);
    }
}

function updatePlacementMessage(placement, totalCount) {
    const placementMessageElement = document.getElementById('placement-message');
    if (placementMessageElement) {
        const leaderboardLink = `/leaderboard/${game}`;
        placementMessageElement.innerHTML = `This team is #${placement} of ${totalCount}. Check out the <a href="${leaderboardLink}">leaderboard</a>!`;
    }
}

// Fetch placement data every 10 seconds
setInterval(fetchPlacement, 10000); // 10000 milliseconds = 10 seconds

// Initial fetch when page loads
fetchPlacement();

// Utility function to convert country code to flag emoji
function countryCodeToFlagEmoji(countryCode) {
    if (countryCode.length !== 2) {
        return countryCode;
    }
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt());
    return String.fromCodePoint(...codePoints);
}
