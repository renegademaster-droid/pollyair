import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { fetchAQObservations, fetchAQForecast, processAQData } from './services/airquality';
import { fetchPollen } from './services/pollen';
import { searchMunicipalities } from './services/municipalities';
import { AQCard } from './components/AQCard';
import { AQChart } from './components/AQChart';
import { Warning } from './components/Warning';
import { AQDetails } from './components/AQDetails';
import { AQMap } from './components/AQMap';
import { subscribePush } from './services/push';
import './App.css';

async function reverseGeocode(lat, lng) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
    { headers: { 'User-Agent': 'PollyAir/1.0' } }
  );
  const data = await res.json();
  return data.address?.city || data.address?.town || data.address?.village || '';
}

async function geocodeSuggest(query) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1&countrycodes=fi&featuretype=settlement`,
    { headers: { 'User-Agent': 'PollyAir/1.0' } }
  );
  const data = await res.json();
  return data.map(r => ({
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    name: r.display_name.split(',')[0],
    detail: [r.address?.city || r.address?.town || r.address?.village, r.address?.country].filter(Boolean).join(', '),
  }));
}

async function geocodeSearch(query) {
  const results = await geocodeSuggest(query);
  if (!results.length) throw new Error('Sijaintia ei löydy');
  return results[0];
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('pollyair-theme') || 'auto');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    localStorage.setItem('pollyair-theme', theme);
  }, [theme]);

  const isDark = theme === 'dark' ||
    (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const toggleTheme = () => setTheme(prev =>
    prev === 'auto' ? (isDark ? 'light' : 'dark') : prev === 'dark' ? 'light' : 'dark'
  );

  const [location, setLocation] = useState(null);
  const [locationName, setLocationName] = useState('');
  const [aqData, setAqData] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pollenData, setPollenData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const pullStartY = useRef(null);
  const pulling = useRef(false);
  const PULL_THRESHOLD = 72;
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const suggestTimer = useRef(null);
  const searchInputRef = useRef(null);
  const [isSearchedLocation, setIsSearchedLocation] = useState(false);
  const [selectedHour, setSelectedHour] = useState(null);
  const [view, setView] = useState('main');
  const defaultLocation = useRef(null);
  const defaultLocationName = useRef('');

  const fetchData = useCallback(async (lat, lng) => {
    try {
      const [obs, forecast, pollen] = await Promise.all([
        fetchAQObservations(lat, lng),
        fetchAQForecast(lat, lng),
        fetchPollen(lat, lng),
      ]);
      setAqData(processAQData(obs, forecast));
      setPollenData(pollen);
      setLastUpdated(new Date());
      setSelectedHour(null);
      setError(null);
    } catch (e) {
      setError('Tietojen haku epäonnistui. Tarkista yhteys.');
    }
  }, []);

  // Get location on mount
  useEffect(() => {
    const initNotifications = () => {
      if (!('Notification' in window) || !import.meta.env.VITE_PUSH_SERVER_URL) return;
      if (Notification.permission === 'granted') return;
      if (Notification.permission === 'denied') return;
      if (localStorage.getItem('pollyair-notif-dismissed')) return;
      setShowNotifBanner(true);
    };

    const fallback = () => {
      const loc = { lat: 60.1699, lng: 24.9384 };
      defaultLocation.current = loc;
      defaultLocationName.current = 'Helsinki';
      setLocation(loc);
      setLocationName('Helsinki');
      setLoading(false);
      initNotifications(loc.lat, loc.lng);
    };

    if (!navigator.geolocation) { fallback(); return; }

    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const loc = { lat, lng };
        defaultLocation.current = loc;
        defaultLocationName.current = 'Helsinki';
        setLocation(loc);
        setLoading(false);
        initNotifications(lat, lng);
        try {
          const name = await reverseGeocode(lat, lng);
          const resolvedName = name || 'Helsinki';
          defaultLocationName.current = resolvedName;
          setLocationName(resolvedName);
        } catch {
          setLocationName('Helsinki');
        }
      },
      fallback,
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // Fetch AQ data when location is ready
  useEffect(() => {
    if (location) fetchData(location.lat, location.lng);
  }, [location, fetchData]);

  // Auto-refresh every 10 min
  useEffect(() => {
    if (!location) return;
    const id = setInterval(() => fetchData(location.lat, location.lng), 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [location, fetchData]);

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    clearTimeout(suggestTimer.current);
    if (val.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    const results = searchMunicipalities(val.trim()).map(m => ({ name: m.name, lat: m.lat, lng: m.lng, detail: '' }));
    setSuggestions(results);
    setShowSuggestions(results.length > 0);
  };

  const handleOpenSearch = () => {
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const handleCloseSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleSuggestionSelect = (result) => {
    setLocation({ lat: result.lat, lng: result.lng });
    setLocationName(result.name);
    setIsSearchedLocation(true);
    setSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
    setSearchOpen(false);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim() || searching) return;
    setShowSuggestions(false);
    setSearching(true);
    try {
      const result = await geocodeSearch(searchQuery.trim());
      setLocation({ lat: result.lat, lng: result.lng });
      setLocationName(result.name);
      setIsSearchedLocation(true);
      setSearchQuery('');
      setSearchOpen(false);
    } catch {
      setError('Sijaintia ei löydy. Kokeile toista hakusanaa.');
    } finally {
      setSearching(false);
    }
  };

  const handleClearSearch = () => {
    setLocation(defaultLocation.current);
    setLocationName(defaultLocationName.current);
    setIsSearchedLocation(false);
  };

  const handleTouchStart = (e) => {
    if (window.scrollY === 0) {
      pullStartY.current = e.touches[0].clientY;
      pulling.current = true;
    }
  };

  const handleTouchMove = (e) => {
    if (!pulling.current || pullStartY.current === null) return;
    const delta = e.touches[0].clientY - pullStartY.current;
    if (delta <= 0) { setPullDistance(0); return; }
    // Resistance: slows down pull after threshold
    const dist = Math.min(delta * 0.5, PULL_THRESHOLD + 20);
    setPullDistance(dist);
  };

  const handleTouchEnd = async () => {
    if (!pulling.current) return;
    pulling.current = false;
    if (pullDistance >= PULL_THRESHOLD && !refreshing) {
      setPullDistance(0);
      await handleRefresh();
    } else {
      setPullDistance(0);
    }
    pullStartY.current = null;
  };

  const handleNotifAllow = async () => {
    setShowNotifBanner(false);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
      if (location) await subscribePush(location.lat, location.lng, 3);
    } catch {}
  };

  const handleNotifDismiss = () => {
    setShowNotifBanner(false);
    localStorage.setItem('pollyair-notif-dismissed', '1');
  };

  const handleRefresh = async () => {
    if (!location || refreshing) return;
    setRefreshing(true);
    await fetchData(location.lat, location.lng);
    setRefreshing(false);
  };

  const displayTrend = useMemo(() => {
    if (!selectedHour || !aqData?.hourly) return aqData?.trend ?? 'stable';
    const idx = aqData.hourly.findIndex(h => h.time.getTime() === selectedHour.time.getTime());
    if (idx <= 0) return 'stable';
    const delta = selectedHour.aqindex - aqData.hourly[idx - 1].aqindex;
    if (delta >= 1) return 'rising';
    if (delta <= -1) return 'falling';
    return 'stable';
  }, [selectedHour, aqData]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Haetaan sijaintia...</p>
      </div>
    );
  }

  const updatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
    : null;

  const displayIdx = selectedHour ? selectedHour.aqindex : aqData?.currentIdx ?? null;
  const displayTime = selectedHour ? selectedHour.time : aqData?.currentTime ?? null;
  const displayWarning = displayIdx !== null && (
    displayIdx >= 4 || (displayIdx >= 3 && displayTrend === 'rising')
  );
  const displayPollutants = selectedHour?.isForecast ? null : aqData?.pollutants ?? null;

  const pulled = pullDistance >= PULL_THRESHOLD;

  return (
    <div
      className="app"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {(pullDistance > 0 || refreshing) && (
        <div
          className={`pull-indicator${pulled ? ' pull-indicator--ready' : ''}`}
          style={{ height: refreshing ? 48 : pullDistance }}
        >
          <span className={`pull-indicator__icon${refreshing ? ' pull-indicator__icon--spinning' : ''}`}>↻</span>
        </div>
      )}
      <header className="app-header">
        <div className="app-header-top">
          <div>
            <h1 className="app-title">PollyAir</h1>
            {locationName && (
              <p className="app-location">
                {locationName}
                {isSearchedLocation && (
                  <button className="app-location-clear" onClick={handleClearSearch} aria-label="Poista haku">✕</button>
                )}
              </p>
            )}
          </div>
          <div className="app-header-right">
            {updatedStr && !searchOpen && <span className="app-updated">{updatedStr}</span>}
            {!searchOpen && (
              <button className="app-search-toggle" onClick={handleOpenSearch} aria-label="Hae">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="7.5" cy="7.5" r="5" />
                  <line x1="11.5" y1="11.5" x2="16" y2="16" />
                </svg>
              </button>
            )}
            <button
              className={`app-refresh${refreshing ? ' app-refresh--spinning' : ''}`}
              onClick={handleRefresh}
              aria-label="Päivitä"
            >
              ↻
            </button>
            <button className="app-theme-toggle" onClick={toggleTheme} aria-label="Vaihda teema">
              {isDark ? '☀' : '☾'}
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="app-search-wrap">
            <form className="app-search" onSubmit={handleSearch}>
              <input
                ref={searchInputRef}
                className="app-search-input"
                type="search"
                placeholder="Hae kaupunki tai sijainti..."
                value={searchQuery}
                onChange={handleQueryChange}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onKeyDown={e => e.key === 'Escape' && handleCloseSearch()}
                autoComplete="off"
              />
              <button className="app-search-btn" type="submit" disabled={searching}>
                {searching ? '…' : '→'}
              </button>
              <button className="app-search-close" type="button" onClick={handleCloseSearch} aria-label="Sulje haku">✕</button>
            </form>
            {showSuggestions && (
              <ul className="app-suggestions">
                {suggestions.map((s, i) => (
                  <li key={i} className="app-suggestion" onMouseDown={() => handleSuggestionSelect(s)}>
                    <span className="app-suggestion-name">{s.name}</span>
                    {s.detail && <span className="app-suggestion-detail">{s.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="app-view-tabs">
          <button className={`app-view-tab${view === 'main' ? ' app-view-tab--active' : ''}`} onClick={() => setView('main')}>Tiedot</button>
          <button className={`app-view-tab${view === 'map' ? ' app-view-tab--active' : ''}`} onClick={() => setView('map')}>Kartta</button>
        </div>
      </header>


      {showNotifBanner && (
        <div className="notif-banner">
          <span className="notif-banner__text">Haluatko ilmoituksia huonosta ilmanlaadusta?</span>
          <div className="notif-banner__actions">
            <button className="notif-banner__allow" onClick={handleNotifAllow}>Salli</button>
            <button className="notif-banner__dismiss" onClick={handleNotifDismiss}>Ei nyt</button>
          </div>
        </div>
      )}

      {view === 'main' ? (
        <main className="app-main">
          <AQCard
            currentIdx={displayIdx}
            trend={displayTrend}
            currentTime={displayTime}
            isForecast={selectedHour?.isForecast ?? false}
          />

          {displayIdx !== null && (
            <Warning
              warning={displayWarning}
              currentIdx={displayIdx}
              trend={displayTrend}
            />
          )}

          {aqData?.hourly?.length > 0 && (
            <AQChart
              hourly={aqData.hourly}
              selectedHour={selectedHour}
              onSelectHour={h => setSelectedHour(
                prev => prev?.time.getTime() === h.time.getTime() ? null : h
              )}
            />
          )}

          {displayPollutants && <AQDetails pollutants={displayPollutants} pollen={pollenData} />}

          {error && <p className="app-error">{error}</p>}
        </main>
      ) : (
        <AQMap selectedHour={selectedHour} isDark={isDark} location={location} />
      )}
    </div>
  );
}
