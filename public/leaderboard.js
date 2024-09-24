// leaderboard.js

// Ensure utils.js is included before this script in your HTML to use getCookie

// Extract GAME from the URL
const urlParts = window.location.pathname.split('/');
// Assuming URL structure is /leaderboard/<GAME>
const game = urlParts[2];

// Store a reference to the leaderboard list
const leaderboardList = document.getElementById('leaderboard-list');

// Maintain a map of team entries for quick access
const teamEntries = {};

// Function to fetch and update the leaderboard
async function fetchLeaderboard() {
    try {
        const response = await fetch(`/api/leaderboard/${game}`);
        if (!response.ok) {
            throw new Error(`Network response was not ok (${response.statusText})`);
        }
        const data = await response.json();

        // Extract the results from the data
        const leaderboardData = data.results;

        // Check if leaderboardData exists and is an array
        if (Array.isArray(leaderboardData)) {
            updateLeaderboard(leaderboardData);
        } else {
            console.error('Invalid data format received from API.');
        }
    } catch (error) {
        console.error('Failed to fetch leaderboard data:', error);
    }
}

/**
 * Updates the leaderboard with new data.
 * @param {Array} data - An array of team objects with teamId, name, and clicks.
 */
function updateLeaderboard(data) {
    // Keep track of existing team IDs
    const existingTeamIds = new Set();

    data.forEach((team, index) => {
        existingTeamIds.add(team.teamId);

        let listItem = teamEntries[team.teamId];

        if (listItem) {
            // Update existing entry
            updateListItem(listItem, team, index);
        } else {
            // Create new entry
            listItem = createListItem(team, index);
            teamEntries[team.teamId] = listItem;
            leaderboardList.appendChild(listItem);
        }
    });

    // Remove any entries that are no longer in the data
    Object.keys(teamEntries).forEach((teamId) => {
        if (!existingTeamIds.has(teamId)) {
            const listItem = teamEntries[teamId];
            leaderboardList.removeChild(listItem);
            delete teamEntries[teamId];
        }
    });

    // Reorder the list items to match the new data order
    reorderLeaderboard(data);
}

/**
 * Creates a new list item for a team.
 * @param {Object} team - The team object.
 * @param {number} index - The position in the leaderboard.
 * @returns {HTMLElement} The list item element.
 */
function createListItem(team, index) {
    const listItem = document.createElement('li');
    listItem.dataset.teamId = team.teamId;

    // Medal icon
    const medalSpan = document.createElement('div');
    medalSpan.classList.add('medal');

    // Rank
    const rankSpan = document.createElement('div');
    rankSpan.classList.add('rank');

    // Team name
    const teamNameSpan = document.createElement('div');
    teamNameSpan.classList.add('team-name');

    // Clicks
    const clicksSpan = document.createElement('div');
    clicksSpan.classList.add('clicks');

    // Append elements to list item
    listItem.appendChild(medalSpan);
    listItem.appendChild(rankSpan);
    listItem.appendChild(teamNameSpan);
    listItem.appendChild(clicksSpan);

    // Update the list item with team data
    updateListItem(listItem, team, index);

    return listItem;
}

/**
 * Updates an existing list item with new team data.
 * @param {HTMLElement} listItem - The list item element.
 * @param {Object} team - The team object.
 * @param {number} index - The position in the leaderboard.
 */
function updateListItem(listItem, team, index) {
    // Update classes for top positions
    listItem.classList.remove('top-1', 'top-2', 'top-3');
    if (index === 0) {
        listItem.classList.add('top-1');
    } else if (index === 1) {
        listItem.classList.add('top-2');
    } else if (index === 2) {
        listItem.classList.add('top-3');
    }

    // Update medal icon
    const medalSpan = listItem.querySelector('.medal');
    if (index === 0) {
        medalSpan.textContent = '🥇';
    } else if (index === 1) {
        medalSpan.textContent = '🥈';
    } else if (index === 2) {
        medalSpan.textContent = '🥉';
    } else {
        medalSpan.textContent = '';
    }

    // Update rank
    const rankSpan = listItem.querySelector('.rank');
    rankSpan.textContent = `#${index + 1}`;

    // Update team name
    const teamNameSpan = listItem.querySelector('.team-name');
    teamNameSpan.textContent = team.name;

    // Update clicks
    const clicksSpan = listItem.querySelector('.clicks');
    clicksSpan.textContent = `${team.clicks} clicks`;

    // Highlight if the team is the user's team
    const userTeamId = getCookie('teamId');
    if (team.teamId === userTeamId) {
        listItem.classList.add('highlight');
    } else {
        listItem.classList.remove('highlight');
    }
}

/**
 * Reorders the leaderboard list items to match the new data order.
 * @param {Array} data - The new leaderboard data.
 */
function reorderLeaderboard(data) {
    // Create a document fragment to minimize reflows
    const fragment = document.createDocumentFragment();

    data.forEach((team) => {
        const listItem = teamEntries[team.teamId];
        fragment.appendChild(listItem);
    });

    // Replace the existing list with the reordered fragment
    leaderboardList.innerHTML = '';
    leaderboardList.appendChild(fragment);
}

// Fetch and update the leaderboard when the page loads
window.addEventListener('load', () => {
    fetchLeaderboard();
    // Refresh the leaderboard every 10 seconds
    setInterval(fetchLeaderboard, 10000); // Refresh every 10 seconds
});
