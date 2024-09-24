// utils.js

/**
 * Retrieves the value of a cookie by name and decodes it.
 * @param {string} name - The name of the cookie.
 * @returns {string|null} The decoded cookie value or null if not found.
 */
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
        return decodeURIComponent(parts.pop().split(';').shift());
    }
    return null;
}

/**
 * Sets a cookie with the given name and value.
 * @param {string} name - The name of the cookie.
 * @param {string} value - The value to store in the cookie.
 * @param {number} [days] - Optional number of days until the cookie expires.
 */
function setCookie(name, value, days) {
    let expires = '';
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days*24*60*60*1000));
        expires = `; expires=${date.toUTCString()}`;
    }
    document.cookie = `${name}=${encodeURIComponent(value)}${expires}; path=/`;
}

/**
 * Deletes a cookie by name.
 * @param {string} name - The name of the cookie to delete.
 */
function deleteCookie(name) {
    setCookie(name, '', -1);
}

/**
 * Converts a country code to its corresponding emoji flag.
 * @param {string} countryCode - The ISO 3166-1 alpha-2 country code.
 * @returns {string} The emoji flag corresponding to the country code.
 */
function countryCodeToFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) {
        return '';
    }
    // Convert to uppercase and split into two characters
    const codePoints = countryCode.toUpperCase().split('').map(char => {
        // 0x1F1E6 is the regional indicator symbol letter A
        // char.charCodeAt(0) - 65 gives us 0 for 'A', 1 for 'B', etc.
        return 0x1F1E6 + char.charCodeAt(0) - 65;
    });
    return String.fromCodePoint(...codePoints);
}
