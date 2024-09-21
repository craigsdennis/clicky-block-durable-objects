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
const team = urlParts[3];  // For team pages only

// Get the username from the cookie
const username = getCookie('username');

// Set the team name for team pages
if (document.getElementById('team-name')) {
    document.getElementById('team-name').textContent = team;
}

// Handle LEGO block click on team pages
if (document.getElementById('lego-block')) {
    document.getElementById('lego-block').addEventListener('click', async () => {
        if (!username) {
            console.error('No username found in cookie');
            return;
        }

        // Find or create the user's stat element
        let userStatElement = document.querySelector(`li[data-username="${username}"]`);
        if (!userStatElement) {
            userStatElement = document.createElement('li');
            userStatElement.dataset.username = username;
            userStatElement.dataset.clicks = 0; // Start from 0 if not found
            document.getElementById('stats-list').appendChild(userStatElement);
        }

        // Optimistically update the user's click count in the UI
        let currentClicks = parseInt(userStatElement.dataset.clicks, 10) || 0;
        userStatElement.dataset.clicks = currentClicks + 1;
        updateUserClickCount(username, currentClicks + 1);

        // Play click sound
        clickSound.play();

        // Send the click data to the backend with GAME and TEAM
        try {
            const response = await fetch(`/api/click/${game}/${team}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username })
            });

            if (!response.ok) {
                console.error('Failed to register click');
                userStatElement.dataset.clicks = currentClicks; // Revert if failed
                updateUserClickCount(username, currentClicks);
            }
        } catch (error) {
            console.error('Error sending click data:', error);
            userStatElement.dataset.clicks = currentClicks; // Revert if error
            updateUserClickCount(username, currentClicks);
        }
    });

    // Poll for team stats every 5 seconds on team pages
    async function fetchStats() {
        const response = await fetch(`/api/stats/${game}/${team}`);
        if (response.ok) {
            const data = await response.json();
            const stats = data.results; // Access the stats from the 'results' key
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
                    listItem.classList.remove('highlight'); // Remove highlight for others
                }
            });
        }
    }

    // Update the user's click count in the UI
    function updateUserClickCount(username, clicks) {
        const userStatElement = document.querySelector(`li[data-username="${username}"]`);
        if (userStatElement) {
            userStatElement.textContent = `${username}: ${clicks} clicks`;
        }
    }

    // Poll every 5 seconds
    setInterval(fetchStats, 5000);

    // Initial stats fetch
    fetchStats();
}

// Load the click sound
const clickSound = new Audio('/click.wav');
