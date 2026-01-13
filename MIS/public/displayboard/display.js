/**
 * DIGITAL SIGNAGE DISPLAY CONTROLLER
 * 
 * Critical design principles:
 * 1. Fixed URL - never navigate away
 * 2. Server decides content - client just displays
 * 3. Offline resilience - cache last known content
 * 4. KaiOS compatible - minimal JS, no heavy frameworks
 * 5. Cache-busting - prevent stale content display
 */

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        API_BASE: 'http://localhost:5001/api',
        POLL_INTERVAL: 10000,        // Poll server every 10 seconds
        HEARTBEAT_INTERVAL: 60000,   // Send heartbeat every 60 seconds
        OFFLINE_RETRY_INTERVAL: 30000, // Retry connection every 30 seconds when offline
        DISPLAY_ID: 'TV-' + Math.random().toString(36).substr(2, 9), // Unique ID for this display
        CACHE_KEY: 'kiosk_last_content',
        ENABLE_STATUS_OVERLAY: false // Set to true for debugging
    };

    // State
    let currentContent = null;
    let currentItemIndex = 0;
    let rotationTimer = null;
    let pollTimer = null;
    let heartbeatTimer = null;
    let isOnline = true;
    let lastUpdateTime = null;

    // DOM elements
    const container = document.getElementById('display-container');
    const offlineIndicator = document.getElementById('offline-indicator');
    const statusOverlay = document.getElementById('status-overlay');

    /**
     * Initialize the display
     */
    function init() {
        console.log('[Kiosk Display] Initializing...', CONFIG.DISPLAY_ID);
        
        // Show status overlay if enabled
        if (CONFIG.ENABLE_STATUS_OVERLAY && statusOverlay) {
            statusOverlay.style.display = 'block';
        }

        // Try to load cached content first (offline fallback)
        loadCachedContent();

        // Start polling for content
        pollContent();
        pollTimer = setInterval(pollContent, CONFIG.POLL_INTERVAL);

        // Start heartbeat
        heartbeatTimer = setInterval(sendHeartbeat, CONFIG.HEARTBEAT_INTERVAL);

        console.log('[Kiosk Display] Initialized successfully');
    }

    /**
     * Poll the server for active content
     */
    function pollContent() {
        const cacheBuster = '?t=' + Date.now();
        const url = CONFIG.API_BASE + '/kiosk/display/content' + cacheBuster;

        fetch(url, {
            method: 'GET',
            headers: { 'Cache-Control': 'no-cache' },
            cache: 'no-store'
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Server returned ' + response.status);
            }
            return response.json();
        })
        .then(data => {
            handleOnline();
            processContent(data);
        })
        .catch(error => {
            console.error('[Kiosk Display] Error fetching content:', error);
            handleOffline();
        });
    }

    /**
     * Process content response from server
     */
    function processContent(data) {
        console.log('[Kiosk Display] Received content:', data);

        // Cache the content for offline fallback
        cacheContent(data);

        // Update status overlay
        updateStatus(data);

        // Check if content has changed
        if (hasContentChanged(data)) {
            currentContent = data;
            currentItemIndex = 0;
            displayContent();
        }
    }

    /**
     * Check if content has changed
     */
    function hasContentChanged(newContent) {
        if (!currentContent) return true;
        
        // Simple comparison (enhance as needed)
        const oldJson = JSON.stringify(currentContent);
        const newJson = JSON.stringify(newContent);
        
        return oldJson !== newJson;
    }

    /**
     * Display the current content
     */
    function displayContent() {
        if (!currentContent) {
            showPlaceholder('No content available');
            return;
        }

        clearRotationTimer();

        if (currentContent.contentType === 'playlist' && currentContent.playlistItems) {
            displayPlaylist();
        } else if (currentContent.contentType === 'image' && currentContent.singleMedia) {
            displaySingleMedia(currentContent.singleMedia);
        } else {
            showPlaceholder('No content scheduled');
        }
    }

    /**
     * Display a playlist (rotating items)
     */
    function displayPlaylist() {
        const items = currentContent.playlistItems;
        
        if (!items || items.length === 0) {
            showPlaceholder('Playlist is empty');
            return;
        }

        // Ensure index is valid
        if (currentItemIndex >= items.length) {
            currentItemIndex = 0;
        }

        const item = items[currentItemIndex];
        displayMediaItem(item);

        // Schedule next item rotation
        const duration = (item.durationSeconds || 10) * 1000;
        rotationTimer = setTimeout(function() {
            currentItemIndex = (currentItemIndex + 1) % items.length;
            displayPlaylist();
        }, duration);
    }

    /**
     * Display a single media item
     */
    function displaySingleMedia(media) {
        displayMediaItem(media);
    }

    /**
     * Display a media item (image or video) with ZERO-BLINK switching
     */
    function displayMediaItem(item) {
        console.log('[Kiosk Display] Displaying:', item);

        // Determine which layer to use (swap between layer-1 and layer-2)
        const currentLayer = document.querySelector('.display-layer.active');
        const nextLayer = currentLayer.id === 'layer-1' 
            ? document.getElementById('layer-2') 
            : document.getElementById('layer-1');

        // Preload media in hidden layer
        if (item.type === 1) { // Video
            const video = document.createElement('video');
            video.className = 'media-item media-video';
            video.src = item.url + '?t=' + Date.now();
            video.autoplay = true;
            video.loop = item.durationSeconds === 0;
            video.muted = true;
            video.preload = 'auto';
            
            video.onerror = function() {
                console.error('[Kiosk Display] Video failed to load:', item.url);
                nextLayer.innerHTML = '<div class="placeholder"><div class="placeholder-message">Video unavailable: ' + item.fileName + '</div></div>';
                swapLayers(currentLayer, nextLayer);
            };

            // Wait for video to be ready before swapping
            video.oncanplay = function() {
                swapLayers(currentLayer, nextLayer);
            };

            nextLayer.innerHTML = '';
            nextLayer.appendChild(video);
        } else { // Image (type 0)
            const img = document.createElement('img');
            img.className = 'media-item media-image';
            img.src = item.url + '?t=' + Date.now();
            img.alt = item.fileName;
            
            img.onerror = function() {
                console.error('[Kiosk Display] Image failed to load:', item.url);
                nextLayer.innerHTML = '<div class="placeholder"><div class="placeholder-message">Image unavailable: ' + item.fileName + '</div></div>';
                swapLayers(currentLayer, nextLayer);
            };

            // Wait for image to fully load before swapping
            img.onload = function() {
                swapLayers(currentLayer, nextLayer);
            };

            nextLayer.innerHTML = '';
            nextLayer.appendChild(img);
        }
    }

    /**
     * Instantly swap layers with ZERO delay/blink
     */
    function swapLayers(oldLayer, newLayer) {
        // Instant swap - no transition
        newLayer.classList.add('active');
        oldLayer.classList.remove('active');
        
        // Clear old layer content after swap to free memory
        setTimeout(function() {
            if (!oldLayer.classList.contains('active')) {
                oldLayer.innerHTML = '';
            }
        }, 100);
    }

    /**
     * Show placeholder message
     */
    function showPlaceholder(message) {
        const currentLayer = document.querySelector('.display-layer.active');
        const nextLayer = currentLayer.id === 'layer-1' 
            ? document.getElementById('layer-2') 
            : document.getElementById('layer-1');
        
        nextLayer.innerHTML = 
            '<div class="placeholder">' +
            '<div class="placeholder-message">' + message + '</div>' +
            '</div>';
        
        swapLayers(currentLayer, nextLayer);
    }

    /**
     * Clear rotation timer
     */
    function clearRotationTimer() {
        if (rotationTimer) {
            clearTimeout(rotationTimer);
            rotationTimer = null;
        }
    }

    /**
     * Handle online state
     */
    function handleOnline() {
        if (!isOnline) {
            console.log('[Kiosk Display] Connection restored');
            isOnline = true;
            if (offlineIndicator) {
                offlineIndicator.style.display = 'none';
            }
        }
    }

    /**
     * Handle offline state
     */
    function handleOffline() {
        if (isOnline) {
            console.warn('[Kiosk Display] Connection lost - showing cached content');
            isOnline = false;
            if (offlineIndicator) {
                offlineIndicator.style.display = 'block';
            }
        }
    }

    /**
     * Cache content to localStorage
     */
    function cacheContent(data) {
        try {
            localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify(data));
            lastUpdateTime = new Date();
        } catch (e) {
            console.error('[Kiosk Display] Failed to cache content:', e);
        }
    }

    /**
     * Load cached content from localStorage
     */
    function loadCachedContent() {
        try {
            const cached = localStorage.getItem(CONFIG.CACHE_KEY);
            if (cached) {
                currentContent = JSON.parse(cached);
                console.log('[Kiosk Display] Loaded cached content');
                displayContent();
            }
        } catch (e) {
            console.error('[Kiosk Display] Failed to load cached content:', e);
        }
    }

    /**
     * Send heartbeat to server (for monitoring)
     */
    function sendHeartbeat() {
        const url = CONFIG.API_BASE + '/kiosk/display/heartbeat';
        
        const payload = {
            displayId: CONFIG.DISPLAY_ID,
            clientTime: new Date().toISOString(),
            currentContent: currentContent ? currentContent.scheduleName : null
        };

        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .catch(function(error) {
            console.debug('[Kiosk Display] Heartbeat failed:', error);
        });
    }

    /**
     * Update status overlay (for debugging)
     */
    function updateStatus(data) {
        if (!CONFIG.ENABLE_STATUS_OVERLAY) return;

        const scheduleEl = document.getElementById('status-schedule');
        const timeEl = document.getElementById('status-time');
        const lastUpdateEl = document.getElementById('status-last-update');

        if (scheduleEl) scheduleEl.textContent = data.scheduleName || 'None';
        if (timeEl) timeEl.textContent = data.serverTime ? new Date(data.serverTime).toLocaleTimeString() : '-';
        if (lastUpdateEl) lastUpdateEl.textContent = new Date().toLocaleTimeString();
    }

    /**
     * Cleanup on unload (optional)
     */
    window.addEventListener('beforeunload', function() {
        clearInterval(pollTimer);
        clearInterval(heartbeatTimer);
        clearRotationTimer();
    });

    // Start the display
    init();

})();
