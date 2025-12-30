// ==UserScript==
// @name         Netflix Ratings Badge (IMDb + RT)
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Shows IMDb & Rotten Tomatoes ratings on Netflix and removes badge when modal closes
// @author       You
// @match        https://www.netflix.com/*
// @grant        GM_xmlhttpRequest
// @connect      omdbapi.com
// ==/UserScript==

(function () {
    'use strict';

    const OMDB_API_KEY = 'ef275783'; // Replace with your OMDb API key
    const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
    let lastTitle = null;

    /* -------------------- Utils -------------------- */

    function getCacheKey(title) {
        return `ratings_${title.toLowerCase()}`;
    }

    function getCached(title) {
        const raw = localStorage.getItem(getCacheKey(title));
        if (!raw) return null;

        const { data, time } = JSON.parse(raw);
        if (Date.now() - time > CACHE_TTL) return null;
        return data;
    }

    function setCache(title, data) {
        localStorage.setItem(getCacheKey(title), JSON.stringify({ data, time: Date.now() }));
    }

    /* -------------------- UI -------------------- */

    function removeBadge() {
        const old = document.getElementById('rating-badge');
        if (old) old.remove();
    }

    function showBadge(imdb, rt) {
        removeBadge();

        const badge = document.createElement('div');
        badge.id = 'rating-badge';
        badge.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: rgba(20,20,20,0.95);
            color: #fff;
            padding: 10px 14px;
            border-radius: 10px;
            font-size: 14px;
            z-index: 999999;
            box-shadow: 0 4px 16px rgba(0,0,0,0.4);
            font-family: system-ui, sans-serif;
        `;

        badge.innerHTML = `
            <div>⭐ IMDb: <b>${imdb || 'N/A'}</b></div>
            <div>🍅 RT: <b>${rt || 'N/A'}</b></div>
        `;

        document.body.appendChild(badge);
    }

    /* -------------------- Data -------------------- */

    function fetchRatings(title) {
        const cached = getCached(title);
        if (cached) {
            showBadge(cached.imdb, cached.rt);
            return;
        }

        GM_xmlhttpRequest({
            method: 'GET',
            url: `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${OMDB_API_KEY}`,
            onload: (res) => {
                try {
                    const json = JSON.parse(res.responseText);
                    if (!json || json.Response === 'False') return;

                    const imdb = json.imdbRating;
                    const rtObj = (json.Ratings || []).find(r => r.Source === 'Rotten Tomatoes');
                    const rt = rtObj ? rtObj.Value : null;

                    setCache(title, { imdb, rt });
                    showBadge(imdb, rt);
                } catch (e) {
                    console.error(e);
                }
            }
        });
    }

    /* -------------------- Title Detection -------------------- */

    function detectTitle() {
        if (location.hostname.includes('netflix')) {
            const info = document.querySelector('.previewModal--info');
            if (!info) return null;

            const texts = [...info.querySelectorAll('span, div')]
                .map(e => e.innerText?.trim())
                .filter(t => t && t.length > 3 && t.length < 60);

            const ignore = [
                'Play','More Info','Episodes','TV','Kids','Trailer','Watch',
                'Because you watched','Explore All','Cast:','Genres:','This Movie Is:',
                'HD','PG','2025','2024','2023','2022','2021','2020','2019','2018','2010','2008',
                '1h','2h','Maturity Rating:','Language'
            ];

            const candidates = texts.filter(t => !ignore.some(i => t.toLowerCase().includes(i.toLowerCase())));

            let title = candidates.find(t => /about/i.test(t));
            if (!title) title = candidates.find(t => /[a-zA-Z]/.test(t));

            // Trim "About " prefix if present
            if (title && title.toLowerCase().startsWith('about ')) {
                title = title.slice(6).trim();
            }

            return title || null;
        }

        // TODO: Add Prime Video detection here
        return null;
    }

    /* -------------------- Observer -------------------- */

    function checkTitleAndShowRatings() {
        const modal = document.querySelector('.previewModal--info');

        // Remove badge if modal is closed
        if (!modal) {
            removeBadge();
            lastTitle = null;
            return;
        }

        const title = detectTitle();
        if (title && title !== lastTitle) {
            lastTitle = title;
            fetchRatings(title);
        }
    }

    function watchPage() {
        const observer = new MutationObserver(() => {
            checkTitleAndShowRatings();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Start observer after 2 seconds
    setTimeout(watchPage, 2000);

})();
