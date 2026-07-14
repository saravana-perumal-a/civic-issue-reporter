// CivicFix Issue Report logic controller
// Coordinates photo upload, location pinpointing, Gemini classification, and duplicate detection.

let map = null;
let marker = null;
let currentCompressedBase64 = null;
const DEFAULT_LAT = 28.6139; // New Delhi
const DEFAULT_LNG = 77.2090;

document.addEventListener("DOMContentLoaded", () => {
  // 1. Check Auth Status - Guard page
  // Route guard is handled by auth.js on load, but we can verify auth is initialized
  
  // 2. Initialize Geolocation and Leaflet Map
  initLeafletMap(DEFAULT_LAT, DEFAULT_LNG);
  fetchGPSLocation();

  // 3. Bind UI Events
  document.getElementById("refresh-gps-btn").addEventListener("click", fetchGPSLocation);
  document.getElementById("issue-photo").addEventListener("change", handlePhotoSelected);
  document.getElementById("preview-remove").addEventListener("click", handlePhotoRemoved);
  document.getElementById("report-form").addEventListener("submit", handleFormSubmission);
});

// Leaflet Map Initialization
function initLeafletMap(lat, lng) {
  if (map) return;
  
  map = L.map("location-map").setView([lat, lng], 13);
  
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  // Red icon for draggable reporting pin
  const redIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });

  marker = L.marker([lat, lng], { draggable: true, icon: redIcon }).addTo(map);

  // Capture pin drag coordinates
  marker.on("dragend", () => {
    const position = marker.getLatLng();
    updateGPSFields(position.lat, position.lng);
  });
}

// Fetch current GPS coordinates
function fetchGPSLocation() {
  if (!navigator.geolocation) {
    showToast("Geolocation is not supported by your browser.", "warning");
    updateGPSFields(DEFAULT_LAT, DEFAULT_LNG);
    return;
  }

  showToast("Fetching GPS location...", "info");
  
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      
      updateGPSFields(lat, lng);
      if (map && marker) {
        map.setView([lat, lng], 16);
        marker.setLatLng([lat, lng]);
      }
      showToast("Location updated successfully.", "success");
    },
    (error) => {
      console.warn("GPS fetching failed:", error);
      showToast("Failed to fetch GPS. You can drag the red pin manually.", "warning");
      updateGPSFields(DEFAULT_LAT, DEFAULT_LNG);
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
}

function updateGPSFields(lat, lng) {
  document.getElementById("gps-lat").value = lat.toFixed(6);
  document.getElementById("gps-lng").value = lng.toFixed(6);
}

// Handle image upload and display preview
async function handlePhotoSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  const uploadZone = document.getElementById("upload-zone");
  const previewContainer = document.getElementById("preview-container");
  const previewImg = document.getElementById("preview-img");
  
  // Show Loading Spinner and Preview
  uploadZone.style.display = "none";
  previewContainer.style.display = "block";
  previewImg.src = URL.createObjectURL(file);
  
  try {
    showToast("Resizing image...", "info");
    // Compress to maximum width/height of 500px, quality 0.6 to minimize payloads
    const base64 = await compressImage(file, 500, 500, 0.6);
    currentCompressedBase64 = base64;
    
    // Classify using Gemini AI
    await classifyPhotoWithGemini(base64);
  } catch (err) {
    console.error("Error processing photo:", err);
    showToast("Error processing photo, please choose another.", "error");
    handlePhotoRemoved();
  }
}

// Clear photo upload and restore state
function handlePhotoRemoved() {
  document.getElementById("issue-photo").value = "";
  currentCompressedBase64 = null;
  
  document.getElementById("upload-zone").style.display = "block";
  document.getElementById("preview-container").style.display = "none";
  document.getElementById("preview-img").src = "";
  
  // Reset AI states
  document.getElementById("ai-status-container").style.display = "none";
  document.getElementById("ai-result").style.display = "none";
  document.getElementById("ai-invalid").style.display = "none";
  
  document.getElementById("issue-category").value = "";
  document.getElementById("submit-btn").disabled = true;
}

// Query Gemini API to classify image categories
async function classifyPhotoWithGemini(base64Data) {
  const geminiKey = localStorage.getItem("CIVICFIX_GEMINI_KEY") || "";
  const aiStatusContainer = document.getElementById("ai-status-container");
  const aiLoading = document.getElementById("ai-loading");
  const aiResult = document.getElementById("ai-result");
  const aiInvalid = document.getElementById("ai-invalid");
  const categorySelect = document.getElementById("issue-category");
  const submitBtn = document.getElementById("submit-btn");

  aiStatusContainer.style.display = "block";
  aiLoading.style.display = "block";
  aiResult.style.display = "none";
  aiInvalid.style.display = "none";
  submitBtn.disabled = true;

  if (!geminiKey) {
    showToast("Gemini API key missing in configurations. Skipping verification. Please enter category manually.", "warning");
    aiLoading.style.display = "none";
    aiStatusContainer.style.display = "none";
    submitBtn.disabled = false;
    return;
  }

  // Extract base64 raw string without prefix
  const rawBase64 = base64Data.split(",")[1];
  const mimeType = base64Data.split(";")[0].split(":")[1] || "image/jpeg";

  const promptText = `
    Analyze this photo of a civic issue. Check if it is a valid civic issue in a city (like potholes, garbage, broken streetlights, sewage, water leakage, broken roads, blocked drains, etc.). 
    If it is NOT a civic issue (e.g. it is a selfie, a meme, an indoor room, a pet, food, or general unrelated scenery), output exactly: "Invalid — not a civic issue."
    If it is a valid civic issue, classify it into one of these exact categories: "Pothole", "Garbage", "Streetlight", "Sewage/Water Leakage", or "Other".
    Output ONLY the category name or "Invalid — not a civic issue." with no extra text, explanations, markdown formatting, or symbols.
  `;

  const payload = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inlineData: {
              mimeType: mimeType,
              data: rawBase64
            }
          }
        ]
      }
    ]
  };

  try {
    // Calling Gemini 1.5 Flash via generative language endpoint
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }

    const resData = await response.json();
    let text = resData.candidates[0].content.parts[0].text.trim();
    console.log("Gemini AI classification response:", text);

    aiLoading.style.display = "none";

    if (text.includes("Invalid")) {
      aiInvalid.style.display = "block";
      showToast("Verification failed: Photo is not classified as a civic issue.", "error");
      submitBtn.disabled = true; // Stay disabled
    } else {
      // Map AI output to selection dropdown
      let matchedCategory = "";
      if (text.includes("Pothole")) matchedCategory = "Pothole";
      else if (text.includes("Garbage")) matchedCategory = "Garbage";
      else if (text.includes("Streetlight")) matchedCategory = "Streetlight";
      else if (text.includes("Sewage/Water Leakage") || text.includes("Sewage") || text.includes("Water Leakage")) matchedCategory = "Sewage/Water Leakage";
      else matchedCategory = "Other";

      document.getElementById("ai-category-text").innerText = matchedCategory;
      aiResult.style.display = "block";
      categorySelect.value = matchedCategory;
      submitBtn.disabled = false;
      showToast("AI classified image category successfully.", "success");
    }
  } catch (error) {
    console.error("Gemini API calling error:", error);
    showToast("Gemini classification failed. Please enter category manually.", "warning");
    aiLoading.style.display = "none";
    aiStatusContainer.style.display = "none";
    submitBtn.disabled = false; // Allow manual override
  }
}

// Calculate distance between two coordinates using the Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

// Submit issue form handler
async function handleFormSubmission(e) {
  e.preventDefault();

  if (!db || !auth) {
    showToast("Firebase not initialized. Make sure you set your configurations.", "error");
    return;
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    showToast("You must be logged in to report an issue.", "error");
    return;
  }

  const category = document.getElementById("issue-category").value;
  const description = document.getElementById("issue-description").value.trim();
  const lat = parseFloat(document.getElementById("gps-lat").value);
  const lng = parseFloat(document.getElementById("gps-lng").value);
  
  if (!category || !description || isNaN(lat) || isNaN(lng) || !currentCompressedBase64) {
    showToast("Please fill all fields and capture/upload an image.", "error");
    return;
  }

  const submitBtn = document.getElementById("submit-btn");
  submitBtn.disabled = true;
  submitBtn.innerText = "Submitting issue...";

  try {
    // 1. Duplicate Detection (Geo-Clustering)
    // Query Firestore for matching active issues of same category
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    showToast("Checking duplicate reports in your area...", "info");
    const activeIssuesSnapshot = await db.collection("issues")
      .where("category", "==", category)
      .where("status", "in", ["Submitted", "Acknowledged", "In Progress"])
      .get();
      
    let duplicateDocId = null;
    let existingDuplicateCount = 0;
    
    activeIssuesSnapshot.forEach((doc) => {
      const data = doc.data();
      const createdAt = data.createdAt ? data.createdAt.toDate() : new Date();
      
      if (createdAt >= sevenDaysAgo) {
        const dist = calculateDistance(lat, lng, data.lat, data.lng);
        if (dist <= 0.05) { // 50 meters
          duplicateDocId = doc.id;
          existingDuplicateCount = data.duplicateCount || 1;
        }
      }
    });

    if (duplicateDocId) {
      // Duplicate found! Increment existing issue duplicate count
      await db.collection("issues").doc(duplicateDocId).update({
        duplicateCount: firebase.firestore.FieldValue.increment(1)
      });
      
      showToast("A similar issue was recently reported nearby. We've upvoted it and added your confirmation!", "success");
      setTimeout(() => {
        window.location.href = "track.html";
      }, 2000);
      return;
    }

    // 2. Routing Mapping (Category -> Department)
    let department = "PWD"; // Default fallback
    if (category === "Garbage") department = "Sanitation";
    else if (category === "Streetlight") department = "Electricity";
    else if (category === "Sewage/Water Leakage") department = "Water";

    // 3. Photo Upload to Firebase Storage
    let photoURL = "";
    showToast("Uploading issue photo...", "info");

    if (storage) {
      try {
        // Prepare storage blob
        const response = await fetch(currentCompressedBase64);
        const blob = await response.blob();
        
        const storageRef = storage.ref();
        const fileRef = storageRef.child(`issues/${Date.now()}_before.jpg`);
        
        const uploadTask = await fileRef.put(blob);
        photoURL = await uploadTask.ref.getDownloadURL();
      } catch (err) {
        console.warn("Storage upload failed, falling back to base64 inline document storage:", err);
        photoURL = currentCompressedBase64;
      }
    } else {
      // Fallback directly to base64 representation
      photoURL = currentCompressedBase64;
    }

    // 4. Create Issue Document in Firestore
    await db.collection("issues").add({
      citizenId: currentUser.uid,
      category: category,
      description: description,
      photoURL: photoURL,
      afterPhotoURL: "", // Empty until resolved
      lat: lat,
      lng: lng,
      status: "Submitted",
      department: department,
      duplicateCount: 1,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      resolvedAt: "" // Empty until resolved
    });

    showToast("Issue report filed successfully!", "success");
    setTimeout(() => {
      window.location.href = "track.html";
    }, 1500);

  } catch (error) {
    console.error("Failed to submit issue:", error);
    showToast("Submission failed: " + error.message, "error");
    submitBtn.disabled = false;
    submitBtn.innerText = "Submit Issue Report";
  }
}
