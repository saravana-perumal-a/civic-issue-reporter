// CivicFix Department Officer Control Logic
// Monitors issues assigned to the officer's department and facilitates status transition pipelines.

let officerDept = "";
let cachedTickets = [];
let activeTab = "active"; // "active" or "resolved"
let resolveCompressedBase64 = null;

document.addEventListener("DOMContentLoaded", () => {
  if (!auth) return;

  // 1. Listen to Auth state and fetch Officer metadata
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      try {
        const userDoc = await db.collection("users").doc(user.uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          if (userData.role !== "officer" && userData.role !== "admin") {
            showToast("Unauthorized page access redirected.", "error");
            window.location.href = "index.html";
            return;
          }
          officerDept = userData.department;
          document.getElementById("dept-title").innerText = `🏛️ ${officerDept} Officer Workspace`;
          document.getElementById("officer-welcome").innerText = `Logged in as ${userData.name}. Showing issue tickets routed to ${officerDept} Department.`;
          
          initializeOfficerDashboard();
        }
      } catch (err) {
        console.error("Error loading officer data:", err);
      }
    }
  });

  // 2. Bind Dashboard Tab controls
  document.getElementById("tab-active").addEventListener("click", () => switchTab("active"));
  document.getElementById("tab-resolved").addEventListener("click", () => switchTab("resolved"));

  // 3. Bind Modal Image selection events
  document.getElementById("resolve-photo").addEventListener("change", handleResolvePhotoSelected);
  document.getElementById("resolve-preview-remove").addEventListener("click", handleResolvePhotoRemoved);
  document.getElementById("resolve-form").addEventListener("submit", handleResolveFormSubmission);
});

// Set up real-time listener for issues assigned to department
function initializeOfficerDashboard() {
  if (!db || !officerDept) return;

  db.collection("issues")
    .where("department", "==", officerDept)
    .onSnapshot((snapshot) => {
      cachedTickets = [];
      snapshot.forEach((doc) => {
        cachedTickets.push({ id: doc.id, ...doc.data() });
      });

      // Sort client-side by date desc
      cachedTickets.sort((a, b) => {
        const dateA = a.createdAt ? a.createdAt.toDate() : new Date(0);
        const dateB = b.createdAt ? b.createdAt.toDate() : new Date(0);
        return dateB - dateA;
      });

      updateStatsSummary();
      renderTickets();
    }, (error) => {
      console.error("Officer dashboard listener failed:", error);
    });
}

// Computes numerical count headers
function updateStatsSummary() {
  let pending = 0;
  let progress = 0;
  let resolved = 0;

  cachedTickets.forEach((t) => {
    if (t.status === "Submitted" || t.status === "Acknowledged") pending++;
    else if (t.status === "In Progress") progress++;
    else if (t.status === "Resolved") resolved++;
  });

  document.getElementById("count-pending").innerText = pending;
  document.getElementById("count-progress").innerText = progress;
  document.getElementById("count-resolved").innerText = resolved;
}

// Switch between Active Work Orders and Completed History
function switchTab(tab) {
  activeTab = tab;
  
  const activeBtn = document.getElementById("tab-active");
  const resolvedBtn = document.getElementById("tab-resolved");

  if (tab === "active") {
    activeBtn.style.backgroundColor = "var(--primary)";
    activeBtn.style.color = "white";
    resolvedBtn.style.backgroundColor = "transparent";
    resolvedBtn.style.color = "var(--text-muted-dark)";
  } else {
    resolvedBtn.style.backgroundColor = "var(--primary)";
    resolvedBtn.style.color = "white";
    activeBtn.style.backgroundColor = "transparent";
    activeBtn.style.color = "var(--text-muted-dark)";
  }

  renderTickets();
}

// Renders filtered assigned issues in card grid
function renderTickets() {
  const container = document.getElementById("officer-tickets-feed");
  container.innerHTML = "";

  const filtered = cachedTickets.filter((t) => {
    if (activeTab === "active") {
      return t.status !== "Resolved";
    } else {
      return t.status === "Resolved";
    }
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 4rem 2rem;">
        <span style="font-size:2.5rem;">🎉</span>
        <h3 style="margin-top:1rem; color:var(--primary); font-weight:700;">No items found</h3>
        <p style="color:var(--text-muted-dark);">There are no issues matching this directory filter.</p>
      </div>
    `;
    return;
  }

  filtered.forEach((ticket) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.justifyContent = "space-between";

    const dateStr = ticket.createdAt ? ticket.createdAt.toDate().toLocaleDateString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    }) : "Pending";

    // Setup action controls based on status
    let actionBtnHtml = "";
    if (ticket.status === "Submitted") {
      actionBtnHtml = `
        <button class="btn btn-secondary btn-sm" onclick="updateTicketStatus('${ticket.id}', 'Acknowledged')">
          📥 Acknowledge Ticket
        </button>
      `;
    } else if (ticket.status === "Acknowledged") {
      actionBtnHtml = `
        <button class="btn btn-primary btn-sm" onclick="updateTicketStatus('${ticket.id}', 'In Progress')">
          🛠️ Start Work (In Progress)
        </button>
      `;
    } else if (ticket.status === "In Progress") {
      actionBtnHtml = `
        <button class="btn btn-primary btn-sm" style="background-color:var(--success);" onclick="openResolveModal('${ticket.id}')">
          ✅ Resolve & Submit Proof
        </button>
      `;
    }

    // High Priority duplicate alerts
    const priorityAlert = ticket.duplicateCount && ticket.duplicateCount >= 3
      ? `<span class="role-badge role-admin" style="font-size:0.7rem;">🔥 Critical: ${ticket.duplicateCount} Duplicate Reports</span>`
      : "";

    // Image comparison setup
    let photoBlock = "";
    if (ticket.status === "Resolved" && ticket.afterPhotoURL) {
      photoBlock = `
        <div class="modal-proof" style="margin-bottom:1rem;">
          <div class="proof-half">
            <div class="proof-title">Before</div>
            <img src="${ticket.photoURL}" class="proof-img">
          </div>
          <div class="proof-half">
            <div class="proof-title" style="color:var(--success);">After</div>
            <img src="${ticket.afterPhotoURL}" class="proof-img">
          </div>
        </div>
      `;
    } else {
      photoBlock = `
        <div style="margin-bottom:1rem; border-radius:var(--radius-md); overflow:hidden; height:180px;">
          <img src="${ticket.photoURL}" style="width:100%; height:100%; object-fit:cover;">
        </div>
      `;
    }

    card.innerHTML = `
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; flex-wrap:wrap; gap:0.5rem;">
          <div>
            <span class="role-badge" style="background:var(--secondary); color:white;">${ticket.category}</span>
            <span style="font-size:0.75rem; color:var(--text-muted-dark); font-weight:600; margin-left:0.5rem;">${dateStr}</span>
          </div>
          <span class="issue-badge badge-${ticket.status.toLowerCase().replace(" ", "")}" style="position:static;">${ticket.status}</span>
        </div>
        
        ${priorityAlert}
        
        <p style="font-size:0.9rem; color:var(--text-muted-dark); margin:0.75rem 0;">
          <strong>Description:</strong> ${ticket.description}
        </p>
        
        ${photoBlock}
      </div>

      <div style="margin-top:1rem; padding-top:1rem; border-top:1px solid var(--border-light); display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap;">
        <a href="map.html?lat=${ticket.lat}&lng=${ticket.lng}" target="_blank" class="btn btn-outline btn-sm" style="color:var(--primary); border-color:var(--primary); font-size:0.75rem; padding:0.25rem 0.5rem;">
          📍 View Map Location
        </a>
        ${actionBtnHtml}
      </div>
    `;

    container.appendChild(card);
  });
}

// Single click state transition updates
async function updateTicketStatus(ticketId, newStatus) {
  if (!db) return;
  try {
    showToast(`Updating ticket to "${newStatus}"...`, "info");
    await db.collection("issues").doc(ticketId).update({
      status: newStatus
    });
    showToast("Status updated successfully.", "success");
  } catch (err) {
    showToast("Failed to update status: " + err.message, "error");
  }
}

// Resolution Modal Trigger
function openResolveModal(ticketId) {
  document.getElementById("resolve-ticket-id").value = ticketId;
  document.getElementById("resolve-modal-overlay").style.display = "flex";
  handleResolvePhotoRemoved(); // Clean prior uploads
}

function closeResolveModal() {
  document.getElementById("resolve-modal-overlay").style.display = "none";
}

// Handle Modal Photo Selector
async function handleResolvePhotoSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  const uploadZone = document.getElementById("resolve-upload-zone");
  const previewContainer = document.getElementById("resolve-preview-container");
  const previewImg = document.getElementById("resolve-preview-img");
  const submitBtn = document.getElementById("resolve-submit-btn");

  uploadZone.style.display = "none";
  previewContainer.style.display = "block";
  previewImg.src = URL.createObjectURL(file);

  try {
    showToast("Processing proof image...", "info");
    const base64 = await compressImage(file, 500, 500, 0.6);
    resolveCompressedBase64 = base64;
    submitBtn.disabled = false;
  } catch (err) {
    showToast("Compression failed, choose another.", "error");
    handleResolvePhotoRemoved();
  }
}

function handleResolvePhotoRemoved() {
  document.getElementById("resolve-photo").value = "";
  resolveCompressedBase64 = null;
  document.getElementById("resolve-upload-zone").style.display = "block";
  document.getElementById("resolve-preview-container").style.display = "none";
  document.getElementById("resolve-preview-img").src = "";
  document.getElementById("resolve-submit-btn").disabled = true;
}

// Submit resolution form uploader
async function handleResolveFormSubmission(e) {
  e.preventDefault();
  
  const ticketId = document.getElementById("resolve-ticket-id").value;
  if (!ticketId || !resolveCompressedBase64 || !db) return;

  const submitBtn = document.getElementById("resolve-submit-btn");
  submitBtn.disabled = true;
  submitBtn.innerText = "Submitting resolution...";

  try {
    let afterPhotoURL = "";
    
    // Upload image to Firebase Storage if available
    if (storage) {
      try {
        const response = await fetch(resolveCompressedBase64);
        const blob = await response.blob();
        
        const storageRef = storage.ref();
        const fileRef = storageRef.child(`issues/${ticketId}_after.jpg`);
        
        const uploadTask = await fileRef.put(blob);
        afterPhotoURL = await uploadTask.ref.getDownloadURL();
      } catch (storageErr) {
        console.warn("Storage upload failed, fallback to base64", storageErr);
        afterPhotoURL = resolveCompressedBase64;
      }
    } else {
      afterPhotoURL = resolveCompressedBase64;
    }

    // Update issue document
    await db.collection("issues").doc(ticketId).update({
      status: "Resolved",
      afterPhotoURL: afterPhotoURL,
      resolvedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    showToast("Issue resolved! Thank you.", "success");
    closeResolveModal();
  } catch (error) {
    console.error("Resolution submit failed:", error);
    showToast("Failed: " + error.message, "error");
    submitBtn.disabled = false;
    submitBtn.innerText = "Confirm Resolution";
  }
}
