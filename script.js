class FyvioWebStream {
    constructor() {
        this.addonUrl = 'http://powerful-tor-53795-63be7b7309a3.herokuapp.com/stremio';
        this.manifest = null;
        this.currentVideo = null;
        this.baseUrl = window.location.hostname === 'localhost' ? '' : '/MvStream';
        this.init();
    }

    async init() {
        await this.loadManifest();
        await this.loadDefaultContent();
        this.setupEventListeners();
        this.setupServiceWorker();
    }

    async setupServiceWorker() {
        if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
            try {
                await navigator.serviceWorker.register(`${this.baseUrl}/sw.js`);
                console.log('Service Worker registered successfully');
            } catch (error) {
                console.log('Service Worker registration failed:', error);
            }
        }
    }

    async loadManifest() {
        try {
            this.updateStatus('Connecting to Fyvio Addon...', 'loading');
            
            const response = await fetch(`${this.addonUrl}/manifest.json`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                mode: 'cors'
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            
            this.manifest = await response.json();
            this.updateStatus('✅ Connected to Fyvio Addon', 'success');
            
            console.log('Manifest loaded:', this.manifest);
            
            // Show success message
            this.showSuccess('Successfully connected to Fyvio Stremio Addon!');
            
        } catch (error) {
            console.error('Error loading manifest:', error);
            this.updateStatus('❌ Failed to connect to addon', 'error');
            this.showError(`Could not connect to Fyvio Stremio Addon: ${error.message}. Please check if the service is running.`);
        }
    }

    async loadDefaultContent() {
        if (!this.manifest || !this.manifest.catalogs) {
            this.showError('No catalogs available from the addon.');
            return;
        }

        try {
            this.showLoading(true);
            
            // Try to load the first available catalog
            for (const catalog of this.manifest.catalogs) {
                try {
                    await this.loadCatalog(catalog.type, catalog.id);
                    break; // Stop after successfully loading the first catalog
                } catch (error) {
                    console.warn(`Failed to load catalog ${catalog.id}:`, error);
                    continue; // Try next catalog
                }
            }
        } catch (error) {
            console.error('Error loading default content:', error);
            this.showError('Failed to load content from Telegram cloud storage. The service might be temporarily unavailable.');
        } finally {
            this.showLoading(false);
        }
    }

    async loadCatalog(type, id, extra = {}) {
        try {
            const params = new URLSearchParams(extra);
            const url = `${this.addonUrl}/catalog/${type}/${id}${params.toString() ? '?' + params.toString() : ''}`;
            
            console.log(`Loading catalog: ${url}`);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                mode: 'cors'
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            
            const data = await response.json();
            
            if (data.metas && data.metas.length > 0) {
                this.displayContent(data.metas);
            } else {
                throw new Error('No content available in this catalog');
            }
            
        } catch (error) {
            console.error('Error loading catalog:', error);
            throw error;
        }
    }

    async searchContent() {
        const query = document.getElementById('searchInput').value.trim();
        if (!query) {
            this.showError('Please enter a search term.');
            return;
        }
        
        if (!this.manifest) {
            this.showError('Addon not connected. Please wait for the connection to be established.');
            return;
        }

        try {
            this.showLoading(true);
            
            // Find search-enabled catalog
            const searchCatalog = this.manifest.catalogs?.find(cat => 
                cat.extra && cat.extra.some(ex => ex.name === 'search')
            );
            
            if (searchCatalog) {
                await this.loadCatalog(searchCatalog.type, searchCatalog.id, { search: query });
            } else {
                // If no search catalog, try to search in the first available catalog
                const firstCatalog = this.manifest.catalogs?.[0];
                if (firstCatalog) {
                    await this.loadCatalog(firstCatalog.type, firstCatalog.id, { search: query });
                } else {
                    this.showError('Search is not supported by this addon.');
                }
            }
        } catch (error) {
            console.error('Search error:', error);
            this.showError(`Search failed: ${error.message}. Please try a different search term.`);
        } finally {
            this.showLoading(false);
        }
    }

    displayContent(metas) {
        const grid = document.getElementById('contentGrid');
        
        if (!metas || metas.length === 0) {
            grid.innerHTML = '<div class="error-message">No content found. Try a different search term or check back later.</div>';
            return;
        }

        // Clear existing content
        grid.innerHTML = '';

        metas.forEach((meta, index) => {
            const item = this.createContentItem(meta, index);
            grid.appendChild(item);
        });

        // Add analytics event
        this.trackEvent('content_displayed', { count: metas.length });
    }

    createContentItem(meta, index) {
        const item = document.createElement('div');
        item.className = 'content-item';
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.setAttribute('aria-label', `Play ${meta.name}`);
        item.onclick = () => this.playContent(meta);
        
        // Keyboard accessibility
        item.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.playContent(meta);
            }
        };

        const posterUrl = meta.poster || meta.background || `https://via.placeholder.com/300x200/2a5298/ffffff?text=${encodeURIComponent(meta.name)}`;
        
        item.innerHTML = `
            <img src="${posterUrl}" 
                 alt="${meta.name}" 
                 loading="${index < 6 ? 'eager' : 'lazy'}"
                 onerror="this.src='https://via.placeholder.com/300x200/2a5298/ffffff?text=${encodeURIComponent(meta.name)}'">
            <h3>${meta.name}</h3>
            <p>${meta.description ? this.truncateText(meta.description, 100) : 'Click to play this content'}</p>
            <div class="content-meta">
                ${meta.year ? `📅 ${meta.year}` : ''}
                ${meta.genre && meta.genre.length ? ` | 🎭 ${meta.genre.slice(0, 2).join(', ')}` : ''}
                ${meta.imdbRating ? ` | ⭐ ${meta.imdbRating}` : ''}
            </div>
        `;

        return item;
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength).trim() + '...';
    }

    async playContent(meta) {
        try {
            this.showLoading(true);
            this.trackEvent('play_attempt', { content: meta.name, type: meta.type });
            
            // Get stream information
            const streamUrl = `${this.addonUrl}/stream/${meta.type}/${meta.id}.json`;
            console.log(`Fetching stream: ${streamUrl}`);
            
            const response = await fetch(streamUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                mode: 'cors'
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            
            const streamData = await response.json();
            
            if (streamData.streams && streamData.streams.length > 0) {
                // Sort streams by quality (if available) and pick the best one
                const sortedStreams = streamData.streams.sort((a, b) => {
                    const qualityOrder = { '1080p': 4, '720p': 3, '480p': 2, '360p': 1 };
                    const aQuality = qualityOrder[a.name] || 0;
                    const bQuality = qualityOrder[b.name] || 0;
                    return bQuality - aQuality;
                });
                
                const bestStream = sortedStreams[0];
                this.startVideo(bestStream.url, meta);
                this.trackEvent('play_success', { content: meta.name, quality: bestStream.name });
            } else {
                throw new Error('No streams available for this content');
            }
        } catch (error) {
            console.error('Error playing content:', error);
            this.showError(`Failed to load video stream: ${error.message}. The content might be temporarily unavailable.`);
            this.trackEvent('play_error', { content: meta.name, error: error.message });
        } finally {
            this.showLoading(false);
        }
    }

    startVideo(url, meta) {
        const videoSection = document.getElementById('videoSection');
        const video = document.getElementById('mainVideo');
        const title = document.getElementById('videoTitle');
        const description = document.getElementById('videoDescription');

        // Set video source
        video.src = url;
        title.textContent = meta.name;
        description.textContent = meta.description || 'Streaming from Telegram cloud storage via Fyvio addon';

        // Show video section
        videoSection.style.display = 'block';
        
        // Scroll to video smoothly
        videoSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Attempt to play video
        const playPromise = video.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log('Video started playing');
                this.showSuccess(`Now playing: ${meta.name}`);
            }).catch(error => {
                console.error('Error playing video:', error);
                this.showError('Unable to play video automatically. Please click the play button manually.');
            });
        }

        this.currentVideo = { url, meta };
    }

    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        const video = document.getElementById('mainVideo');

        // Search on Enter key
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchContent();
            }
        });

        // Video event handlers
        video.addEventListener('loadstart', () => {
            console.log('Video loading started');
        });

        video.addEventListener('canplay', () => {
            console.log('Video can start playing');
        });

        video.addEventListener('error', (e) => {
            console.error('Video error:', e);
            const error = video.error;
            let errorMessage = 'Video playback error.';
            
            if (error) {
                switch (error.code) {
                    case error.MEDIA_ERR_ABORTED:
                        errorMessage = 'Video playback was aborted.';
                        break;
                    case error.MEDIA_ERR_NETWORK:
                        errorMessage = 'Network error occurred while loading video.';
                        break;
                    case error.MEDIA_ERR_DECODE:
                        errorMessage = 'Video format is not supported.';
                        break;
                    case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                        errorMessage = 'Video source is not available or supported.';
                        break;
                }
            }
            
            this.showError(`${errorMessage} The stream might be temporarily unavailable.`);
        });

        video.addEventListener('ended', () => {
            this.showSuccess('Video playback completed!');
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.getElementById('aboutModal').style.display === 'block') {
                this.closeAbout();
            }
        });
    }

    showLoading(show) {
        const spinner = document.getElementById('loadingSpinner');
        spinner.style.display = show ? 'block' : 'none';
        spinner.setAttribute('aria-hidden', !show);
    }

    updateStatus(text, type) {
        const statusText = document.getElementById('statusText');
        const statusDot = document.querySelector('.status-dot');
        
        statusText.textContent = text;
        statusDot.className = `status-dot ${type}`;
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    showMessage(message, type) {
        const grid = document.getElementById('contentGrid');
        const messageDiv = document.createElement('div');
        messageDiv.className = `${type}-message`;
        messageDiv.textContent = message;
        messageDiv.setAttribute('role', 'alert');
        
        // Insert at the beginning
        if (grid.firstChild) {
            grid.insertBefore(messageDiv, grid.firstChild);
        } else {
            grid.appendChild(messageDiv);
        }

        // Remove after delay
        const delay = type === 'error' ? 8000 : 4000;
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, delay);
    }

    trackEvent(eventName, parameters = {}) {
        // Simple analytics tracking (can be replaced with Google Analytics, etc.)
        if (typeof gtag !== 'undefined') {
            gtag('event', eventName, parameters);
        }
        console.log(`Analytics: ${eventName}`, parameters);
    }
}

// Global functions for HTML onclick handlers
function searchContent() {
    if (window.fyvioStream) {
        window.fyvioStream.searchContent();
    }
}

function showAbout() {
    document.getElementById('aboutModal').style.display = 'block';
}

function closeAbout() {
    document.getElementById('aboutModal').style.display = 'none';
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.fyvioStream = new FyvioWebStream();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && window.fyvioStream) {
        // Reconnect if needed when page becomes visible
        if (!window.fyvioStream.manifest) {
            window.fyvioStream.loadManifest();
        }
    }
});