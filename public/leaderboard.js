// Extract GAME from the URL
const game = window.location.pathname.split('/')[2];  // Assuming /leaderboard/<GAME>

// Fetch leaderboard data
async function fetchLeaderboard() {
    const response = await fetch(`/api/leaderboard/${game}`);
    if (response.ok) {
        const leaderboard = await response.json();
        const leaderboardList = document.getElementById('leaderboard-list');
        leaderboardList.innerHTML = '';  // Clear the list

        // Create list items for each team
        leaderboard.forEach(team => {
            const listItem = document.createElement('li');
            listItem.textContent = `${team.name}: ${team.clicks} clicks`;
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
