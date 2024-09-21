// Helper function to get the value of a cookie and decode it
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
    return null;
}

// Get teamId from the cookie
const teamId = getCookie('teamId');

// Extract GAME from the URL
const game = window.location.pathname.split('/')[2];  // Assuming /leaderboard/<GAME>

// Fetch leaderboard data
async function fetchLeaderboard() {
    const response = await fetch(`/api/leaderboard/${game}`);
    if (response.ok) {
        const data = await response.json();
        const leaderboard = data.results; // Access the leaderboard data from the 'results' key
        const leaderboardList = document.getElementById('leaderboard-list');
        leaderboardList.innerHTML = '';  // Clear the list

        // Create list items for each team
        leaderboard.forEach(team => {
            const listItem = document.createElement('li');
            listItem.dataset.teamId = team.teamId; // Use data properties for team ID
            listItem.textContent = `${team.name}: ${team.clicks} clicks`;

            // Highlight the user's team if teamId matches the one in the cookie
            if (team.teamId === teamId) {
                listItem.classList.add('highlight'); // Add a class to highlight the team
            }

            leaderboardList.appendChild(listItem);
        });
    } else {
        console.error('Failed to fetch leaderboard data');
    }
}

// Poll every 5 seconds
setInterval(fetchLeaderboard, 5000);

// Initial leaderboard fetch
fetchLeaderboard();
