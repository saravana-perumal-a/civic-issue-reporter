// CivicFix Public Leaflet Map Logic Controller
// Pins issues dynamically, supports clustering/priority scaling, status filtering, and map interactions.

let publicMap = null;
let activeMarkers = [];
let cachedIssues = [];

const DEFAULT_CENTER_LAT = 28.6139; // New Delhi
const DEFAULT_CENTER_LNG = 77.2090;

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  setupFilterEvents();
  fetchIssuesFeed();
});

// Initialize Leaflet Map
function initMap() {
  const urlParams = new URLSearchParams(window.location.search);
  const paramLat = parseFloat(urlParams.get("lat"));
  const paramLng = parseFloat(urlParams.get("lng"));

  let centerLat = DEFAULT_CENTER_LAT;
  let centerLng = DEFAULT_CENTER_LNG;
  let centerZoom = 12;
  let hasQueryParams = false;

  if (!isNaN(paramLat) && !isNaN(paramLng)) {
    centerLat = paramLat;
    centerLng = paramLng;
    centerZoom = 16;
    hasQueryParams = true;
  }

  publicMap = L.map("public-map").setView([centerLat, centerLng], centerZoom);

  // Standard OpenStreetMap Tile layer
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(publicMap);

  // Add Color Legend Control Overlay
  const legend = L.control({ position: "bottomright" });
  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "legend");
    div.innerHTML = `
      <h4 style="font-weight:700; margin-bottom:0.5rem; font-size:0.85rem;">Issue Status Legend</h4>
      <div class="legend-item"><span class="legend-color" style="background:#ef4444;"></span> Open / Acknowledged</div>
      <div class="legend-item"><span class="legend-color" style="background:#f59e0b;"></span> In Progress</div>
      <div class="legend-item"><span class="legend-color" style="background:#10b981;"></span> Resolved</div>
      <div class="legend-item"><span class="legend-color marker-pulse" style="background:#ef4444; width:10px; height:10px; display:inline-block; border-radius:50%; box-shadow:0 0 0 2px white;"></span> High Priority (3+ reports)</div>
    `;
    return div;
  };
  legend.addTo(publicMap);

  // Fetch user location to center map dynamically if allowed (skip if we have specific coordinates from dashboard)
  if (!hasQueryParams && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        publicMap.setView([lat, lng], 13);
        
        // Add a small blue dot representing user location
        const userIcon = L.divIcon({
          html: `<div style="background-color: #0284c7; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.45);"></div>`,
          className: "user-loc-marker",
          iconSize: [14, 14]
        });
        L.marker([lat, lng], { icon: userIcon }).addTo(publicMap).bindPopup("You are here");
      },
      () => { console.log("User geolocation denied or unavailable. Centered on fallback."); }
    );
  }
}

// Attach event listeners to sidebar filters
function setupFilterEvents() {
  document.getElementById("map-filter-category").addEventListener("change", renderMapAndSidebar);
  document.getElementById("map-filter-status").addEventListener("change", renderMapAndSidebar);
}

// Fetch all issues live from Firestore
function fetchIssuesFeed() {
  if (!db) {
    loadMockMapData();
    return;
  }

  // Live listen for all issues
  db.collection("issues").onSnapshot((snapshot) => {
    cachedIssues = [];
    snapshot.forEach((doc) => {
      cachedIssues.push({ id: doc.id, ...doc.data() });
    });
    renderMapAndSidebar();
  }, (err) => {
    console.error("Error reading issues snapshot:", err);
    loadMockMapData();
  });
}

// Renders Leaflet Pins & Sidebar directory listing
function renderMapAndSidebar() {
  // 1. Clear existing markers
  activeMarkers.forEach((m) => publicMap.removeLayer(m));
  activeMarkers = [];

  const categoryFilter = document.getElementById("map-filter-category").value;
  const statusFilter = document.getElementById("map-filter-status").value;
  const listContainer = document.getElementById("sidebar-issues-list");
  
  listContainer.innerHTML = "";

  // 2. Filter cached items
  const filtered = cachedIssues.filter((issue) => {
    const matchesCategory = categoryFilter === "ALL" || issue.category === categoryFilter;
    const matchesStatus = statusFilter === "ALL" || issue.status === statusFilter;
    return matchesCategory && matchesStatus;
  });

  // Calculate and display stats
  let activeCount = 0;
  let resolvedCount = 0;
  
  // Stats should reflect global or filtered? Let's count within global to keep dashboard realistic
  cachedIssues.forEach(is => {
    if (is.status === "Resolved") resolvedCount++;
    else activeCount++;
  });
  document.getElementById("sidebar-count-active").innerText = activeCount;
  document.getElementById("sidebar-count-resolved").innerText = resolvedCount;

  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <p style="text-align:center; color:var(--text-muted-dark); font-size:0.85rem; padding:2rem 0;">
        No issues matching filters found.
      </p>
    `;
    return;
  }

  // 3. Render markers & sidebar cards
  filtered.forEach((issue) => {
    // Determine pin colors and priority styles
    let color = "#ef4444"; // Red for Submitted / Acknowledged
    if (issue.status === "In Progress") color = "#f59e0b"; // Yellow
    else if (issue.status === "Resolved") color = "#10b981"; // Green

    const isHighPriority = issue.duplicateCount && issue.duplicateCount >= 3;
    const size = isHighPriority ? 28 : 20;
    const pulseClass = isHighPriority ? "marker-pulse" : "";

    const customIcon = L.divIcon({
      className: "custom-pin",
      html: `
        <div style="
          background-color: ${color}; 
          width: ${size}px; 
          height: ${size}px; 
          border-radius: 50%; 
          border: 2px solid white; 
          box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        " class="${pulseClass}"></div>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });

    // Create marker
    const marker = L.marker([issue.lat, issue.lng], { icon: customIcon }).addTo(publicMap);
    activeMarkers.push(marker);

    // Dynamic Popups layout
    const popupContent = createPopupMarkup(issue);
    marker.bindPopup(popupContent);

    // Sidebar directory list cards layout
    const card = document.createElement("div");
    card.className = "sidebar-issue-card";
    
    const dateStr = issue.createdAt ? issue.createdAt.toDate().toLocaleDateString(undefined, {
      month: "short", day: "numeric"
    }) : "Pending";

    const isPriorityLabel = isHighPriority 
      ? `<span class="role-badge role-admin" style="font-size:0.6rem; padding:0.1rem 0.3rem;">🔥 Priority</span>` 
      : "";

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
        <span class="role-badge" style="font-size:0.65rem; background:#cbd5e1; color:#334155;">${issue.category}</span>
        <span style="font-size:0.75rem; color:var(--text-muted-dark);">${dateStr}</span>
      </div>
      <div style="font-weight:700; font-size:0.9rem; color:var(--text-dark); display:flex; align-items:center; gap:0.25rem;">
        ${issue.category} Issue ${isPriorityLabel}
      </div>
      <p style="font-size:0.8rem; color:var(--text-muted-dark); margin:0.25rem 0 0.5rem 0; display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical; overflow:hidden;">
        ${issue.description}
      </p>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="issue-badge badge-${issue.status.toLowerCase().replace(" ", "")}" style="font-size:0.65rem; padding:0.15rem 0.4rem;">${issue.status}</span>
        ${issue.duplicateCount > 1 ? `<span style="font-size:0.7rem; font-weight:700; color:var(--danger);">⚠️ ${issue.duplicateCount} Votes</span>` : ""}
      </div>
    `;

    // Click sidebar card to zoom to marker & trigger popup
    card.addEventListener("click", () => {
      publicMap.setView([issue.lat, issue.lng], 16);
      marker.openPopup();
    });

    listContainer.appendChild(card);
  });
}

// Generates beautiful popup cards inside map bubbles
function createPopupMarkup(issue) {
  const badgeClass = `badge-${issue.status.toLowerCase().replace(" ", "")}`;
  const duplicateBadge = issue.duplicateCount && issue.duplicateCount > 1 
    ? `<span style="background:var(--danger); color:white; padding:0.15rem 0.4rem; font-size:0.7rem; font-weight:700; border-radius:3px;">🚨 ${issue.duplicateCount} Reports</span>` 
    : "";

  let photoSection = "";
  if (issue.status === "Resolved" && issue.afterPhotoURL) {
    photoSection = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px; margin-bottom:8px;">
        <img src="${issue.photoURL}" style="width:100%; height:75px; object-fit:cover; border-radius:3px;" title="Before">
        <img src="${issue.afterPhotoURL}" style="width:100%; height:75px; object-fit:cover; border-radius:3px; border:1.5px solid var(--success);" title="Resolved Proof">
      </div>
    `;
  } else {
    photoSection = `<img src="${issue.photoURL}" class="map-popup-img" style="margin-bottom:8px;">`;
  }

  return `
    <div class="map-popup-card">
      ${photoSection}
      <div class="map-popup-body">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; flex-wrap:wrap; gap:4px;">
          <span class="role-badge" style="background:#0f766e; color:white; font-size:0.65rem;">${issue.category}</span>
          ${duplicateBadge}
        </div>
        <p class="map-popup-desc"><strong>Desc:</strong> ${issue.description}</p>
        <div class="map-popup-footer">
          <span class="issue-badge ${badgeClass}" style="font-size:0.7rem; padding:0.2rem 0.5rem; position:static;">${issue.status}</span>
          <span style="font-size:0.7rem; color:var(--text-muted-dark); font-weight:600;">Dept: ${issue.department}</span>
        </div>
      </div>
    </div>
  `;
}

// Mock map database fallback for local previews
function loadMockMapData() {
  console.log("Loading mock map dataset...");
  cachedIssues = [
    {
      id: "mock1",
      category: "Pothole",
      description: "Massive pothole in the center lane of the road. Damaging vehicle suspensions.",
      photoURL: "https://images.unsplash.com/photo-1515162305285-0293e4767cc2?w=500",
      afterPhotoURL: "",
      lat: 28.625,
      lng: 77.215,
      status: "Submitted",
      department: "PWD",
      duplicateCount: 1,
      createdAt: { toDate: () => new Date() }
    },
    {
      id: "mock2",
      category: "Garbage",
      description: "Huge dumpster overflow spilling plastic waste across the street walkway.",
      photoURL: "https://images.unsplash.com/photo-1611284446314-60a58ac0deb9?w=500",
      afterPhotoURL: "https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=500",
      lat: 28.61,
      lng: 77.23,
      status: "Resolved",
      department: "Sanitation",
      duplicateCount: 4,
      createdAt: { toDate: () => new Date(Date.now() - 3 * 86400000) },
      resolvedAt: { toDate: () => new Date() }
    },
    {
      id: "mock3",
      category: "Streetlight",
      description: "Entire line of streetlights are non-functioning since last Wednesday. Dark street concerns.",
      photoURL: "https://images.unsplash.com/photo-1509024644558-2f56ce76c090?w=500",
      afterPhotoURL: "",
      lat: 28.59,
      lng: 77.20,
      status: "In Progress",
      department: "Electricity",
      duplicateCount: 3,
      createdAt: { toDate: () => new Date(Date.now() - 5 * 86400000) }
    }
  ];
  renderMapAndSidebar();
}
