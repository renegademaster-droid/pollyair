import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { fetchAQObservations, fetchAQForecast, processAQData } from './services/airquality';
import { fetchPollen } from './services/pollen';
import { AQCard } from './components/AQCard';
import { AQChart } from './components/AQChart';
import { Warning } from './components/Warning';
import { AQDetails } from './components/AQDetails';
import { NotificationButton } from './components/NotificationButton';
import './App.css';

async function reverseGeocode(lat, lng) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
    { headers: { 'User-Agent': 'PollyAir/1.0' } }
  );
  const data = await res.json();
  return data.address?.city || data.address?.town || data.address?.village || '';
}

async function geocodeSearch(query) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
    { headers: { 'User-Agent': 'PollyAir/1.0' } }
  );
  const data = await res.json();
  if (!data.length) throw new Error('Sijaintia ei löydy');
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), name: data[0].display_name.split(',')[0] };
}

export default function App() {
  const [location, setLocation] = useState(null);
  const [locationName, setLocationName] = useState('');
  const [aqData, setAqData] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pollenData, setPollenData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [isSearchedLocation, setIsSearchedLocation] = useState(false);
  const [selectedHour, setSelectedHour] = useState(null);
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
    const fallback = () => {
      const loc = { lat: 60.1699, lng: 24.9384 };
      defaultLocation.current = loc;
      defaultLocationName.current = 'Helsinki';
      setLocation(loc);
      setLocationName('Helsinki');
      setLoading(false);
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

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim() || searching) return;
    setSearching(true);
    try {
      const result = await geocodeSearch(searchQuery.trim());
      setLocation({ lat: result.lat, lng: result.lng });
      setLocationName(result.name);
      setIsSearchedLocation(true);
      setSearchQuery('');
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

  return (
    <div className="app">
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
            {updatedStr && <span className="app-updated">{updatedStr}</span>}
            <NotificationButton lat={location?.lat} lng={location?.lng} />
            <button
              className={`app-refresh${refreshing ? ' app-refresh--spinning' : ''}`}
              onClick={handleRefresh}
              aria-label="Päivitä"
            >
              ↻
            </button>
          </div>
        </div>
        <form className="app-search" onSubmit={handleSearch}>
          <input
            className="app-search-input"
            type="search"
            placeholder="Hae kaupunki tai sijainti..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <button className="app-search-btn" type="submit" disabled={searching}>
            {searching ? '…' : '→'}
          </button>
        </form>
      </header>


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
    </div>
  );
}
