/**
 * Utility functions for handling media and placeholders
 */

const DEFAULT_PLACEHOLDER_SERVICE = 'https://placehold.co';

/**
 * Get placeholder image URL
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {string} text - Optional text to display on placeholder
 * @returns {string} Placeholder image URL
 */
export function getPlaceholderImage(width, height, text = '') {
    const service = process.env.PLACEHOLDER_SERVICE || DEFAULT_PLACEHOLDER_SERVICE;
    const size = `${width}x${height}`;
    return text 
        ? `${service}/${size}?text=${encodeURIComponent(text)}`
        : `${service}/${size}`;
}

/**
 * Get video thumbnail placeholder
 * @param {string} title - Video title
 * @returns {string} Thumbnail URL
 */
export function getVideoThumbnail(title = 'Video') {
    const size = process.env.DEFAULT_THUMBNAIL_SIZE || '320x180';
    return getPlaceholderImage(...size.split('x'), title);
}

/**
 * Get user avatar placeholder
 * @param {string} initials - User initials
 * @returns {string} Avatar URL
 */
export function getUserAvatar(initials = '') {
    const size = process.env.DEFAULT_AVATAR_SIZE || '40x40';
    return getPlaceholderImage(...size.split('x'), initials);
}

/**
 * Get fallback image URL
 * Used when primary image fails to load
 * @param {string} type - Type of fallback image ('avatar', 'thumbnail', etc)
 * @returns {string} Fallback image URL
 */
export function getFallbackImage(type = 'default') {
    const sizes = {
        avatar: '40x40',
        thumbnail: '320x180',
        default: '100x100'
    };
    const size = sizes[type] || sizes.default;
    return getPlaceholderImage(...size.split('x'));
}