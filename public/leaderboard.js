// utils.js (New file for common utility functions)
// Place this in a separate file if you plan to reuse it across multiple scripts.
function getCookie(name) {
	const value = `; ${document.cookie}`;
	const parts = value.split(`; ${name}=`);
	if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
	return null;
  }

  // Get teamId from the cookie
  const teamId = getCookie('teamId');

  // Extract GAME from the URL
  const urlParts = window.location.pathname.split('/');
  const game = urlParts[2]; // Assuming /leaderboard/<GAME>

  // Elements
  const leaderboardList = document.getElementById('leaderboard-list');

  // Fetch leaderboard data
  async function fetchLeaderboard() {
	leaderboardList.innerHTML = '<li>Loading leaderboard...</li>';

	try {
	  const response = await fetch(`/api/leaderboard/${game}`);
	  if (response.ok) {
		const data = await response.json();
		const leaderboard = data.results; // Access the leaderboard data from the 'results' key

		if (Array.isArray(leaderboard) && leaderboard.length > 0) {
		  renderLeaderboard(leaderboard);
		} else {
		  leaderboardList.innerHTML = '<li>No leaderboard data available.</li>';
		}
	  } else {
		console.error('Failed to fetch leaderboard data');
		leaderboardList.innerHTML = '<li>Error loading leaderboard. Please try again later.</li>';
	  }
	} catch (error) {
	  console.error('Network error:', error);
	  leaderboardList.innerHTML = '<li>Network error. Please check your connection.</li>';
	}
  }

  // Render leaderboard
  function renderLeaderboard(data) {
    const leaderboardList = document.getElementById('leaderboard-list');
    leaderboardList.innerHTML = ''; // Clear any existing content

    data.forEach((team, index) => {
        const listItem = document.createElement('li');
        listItem.dataset.teamId = team.teamId;

        // Create elements for rank, team name, and clicks
        const rankSpan = document.createElement('div');
        rankSpan.classList.add('rank');
        rankSpan.textContent = `#${index + 1}`;

        const teamNameSpan = document.createElement('div');
        teamNameSpan.classList.add('team-name');
        teamNameSpan.textContent = team.name;

        const clicksSpan = document.createElement('div');
        clicksSpan.classList.add('clicks');
        clicksSpan.textContent = `${team.clicks} clicks`;

        // Append elements to list item
        listItem.appendChild(rankSpan);
        listItem.appendChild(teamNameSpan);
        listItem.appendChild(clicksSpan);

        // Highlight if the team is the user's team
        if (team.teamId === teamId) {
            listItem.classList.add('highlight');
        }

        leaderboardList.appendChild(listItem);
    });
}

  // Set up polling with increased interval and clear on unload
  const intervalId = setInterval(fetchLeaderboard, 3000); // Poll every 3 seconds

  window.addEventListener('beforeunload', () => {
	clearInterval(intervalId);
  });

  // Initial leaderboard fetch
  fetchLeaderboard();
