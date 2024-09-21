// Helper function to get the username from the cookie
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

// Extract GAME and TEAM from the URL
const urlParts = window.location.pathname.split('/');
const game = urlParts[2];  // Assuming URL structure is /play/<GAME>/<TEAM>
const team = urlParts[3];  // For team pages only

// Set the team name for team pages
if (document.getElementById('team-name')) {
    document.getElementById('team-name').textContent = team;
}

// Handle LEGO block click on team pages
if (document.getElementById('lego-block')) {
    document.getElementById('lego-block').addEventListener('click', async () => {
        const username = getCookie('username');
        if (!username) {
            console.error('No username found in cookie');
            return;
        }

        // Send the click data to the backend with GAME and TEAM
        const response = await fetch(`/api/click/${game}/${team}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username })
        });

        if (!response.ok) {
            console.error('Failed to register click');
        }
    });

    // Poll for team stats every 5 seconds on team pages
    async function fetchStats() {
        const response = await fetch(`/api/stats/${game}/${team}`);
        if (response.ok) {
            const stats = await response.json();
            const statsList = document.getElementById('stats-list');
            statsList.innerHTML = ''; // Clear the existing stats

            stats.forEach(stat => {
                const listItem = document.createElement('li');
                listItem.textContent = `${stat.username} (${stat.country}): ${stat.clicks} clicks`;
                statsList.appendChild(listItem);
            });
        }
    }

    // Poll every 5 seconds
    setInterval(fetchStats, 5000);

    // Initial stats fetch
    fetchStats();
}
