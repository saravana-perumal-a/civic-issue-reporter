// CivicFix Citizen Issue Tracking Logic
// Establishes real-time bindings to citizen reports and animates status timelines.

let previousStatuses = {};
let isInitialLoad = true;

document.addEventListener("DOMContentLoaded", () => {
  if (!auth) return;
  
  auth.onAuthStateChanged((user) => {
    if (user) {
      initializeTracker(user.uid);
    } else {
      document.getElementById("issues-list-container").innerHTML = `
        <div class="card" style="text-align: center; padding: 2rem;">
          <p style="color: var(--danger);">Please login to track your issues.</p>
          <a href="login.html" class="btn btn-primary" style="margin-top:1rem;">Go to Login</a>
        </div>
      `;
    }
  });
});

function initializeTracker(citizenId) {
  if (!db) return;
  
  // Real-time listener for citizen's issues
  // Fetching all issues for this citizen. We sort client-side to avoid index requirements in Firestore.
  db.collection("issues")
    .where("citizenId", "==", citizenId)
    .onSnapshot((snapshot) => {
      const container = document.getElementById("issues-list-container");
      
      if (snapshot.empty) {
        container.innerHTML = `
          <div class="card" style="text-align: center; padding: 4rem 2rem;">
            <span style="font-size: 3rem;">🌱</span>
            <h3 style="margin-top: 1rem; color: var(--primary); font-weight: 700;">No reported issues found</h3>
            <p style="color: var(--text-muted-dark); max-width: 400px; margin: 0.5rem auto 1.5rem auto;">
              You have not submitted any civic issues yet. Help make your community clean and green by filing your first report.
            </p>
            <a href="report.html" class="btn btn-primary">File a Report</a>
          </div>
        `;
        isInitialLoad = false;
        return;
      }

      // Convert docs to array and sort client-side by createdAt desc
      const docs = [];
      snapshot.forEach((doc) => {
        docs.push({ id: doc.id, ...doc.data() });
      });
      
      docs.sort((a, b) => {
        const timeA = a.createdAt ? a.createdAt.toDate() : new Date(0);
        const timeB = b.createdAt ? b.createdAt.toDate() : new Date(0);
        return timeB - timeA;
      });

      // Clear layout container
      container.innerHTML = "";

      docs.forEach((issue) => {
        // Trigger live toast notifications on status change (excluding initial load)
        if (!isInitialLoad) {
          const oldStatus = previousStatuses[issue.id];
          if (oldStatus && oldStatus !== issue.status) {
            let alertType = "info";
            if (issue.status === "Resolved") alertType = "success";
            else if (issue.status === "In Progress") alertType = "warning";
            
            showToast(`Update: Your ${issue.category} report has been updated to "${issue.status}"!`, alertType);
          }
        }
        
        // Cache current status
        previousStatuses[issue.id] = issue.status;
        
        // Render Card Markup
        container.appendChild(createIssueCard(issue));
      });
      
      isInitialLoad = false;
    }, (error) => {
      console.error("Tracking listener failed:", error);
      document.getElementById("issues-list-container").innerHTML = `
        <div class="card" style="text-align: center; padding: 2rem;">
          <p style="color: var(--danger);">Failed to load tracker feed: ${error.message}</p>
        </div>
      `;
    });
}

// Generate DOM node for an issue card
function createIssueCard(issue) {
  const card = document.createElement("div");
  card.className = "card";
  card.style.padding = "0";
  card.style.overflow = "hidden";

  const dateStr = issue.createdAt ? issue.createdAt.toDate().toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : "Pending...";
  
  const resolvedDateStr = issue.resolvedAt && issue.status === "Resolved" 
    ? issue.resolvedAt.toDate().toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      })
    : null;

  // Duplicate indicators
  const dupBadgeHtml = issue.duplicateCount && issue.duplicateCount > 1
    ? `<span class="duplicate-badge" style="position:static; margin-bottom: 0.5rem; display:inline-flex;">⚠️ Upvoted by ${issue.duplicateCount} citizens</span>`
    : "";

  // Dynamic status timeline stages configurations
  const statuses = ["Submitted", "Acknowledged", "In Progress", "Resolved"];
  const currentIdx = statuses.indexOf(issue.status);
  
  let timelineHtml = '<div class="status-timeline">';
  statuses.forEach((s, idx) => {
    let stateClass = "";
    if (idx < currentIdx) stateClass = "completed";
    else if (idx === currentIdx) stateClass = "active";
    
    let dotContent = idx + 1;
    if (idx < currentIdx) dotContent = "✓";
    
    timelineHtml += `
      <div class="status-step ${stateClass}">
        <div class="status-dot">${dotContent}</div>
        <div class="status-text">${s}</div>
      </div>
    `;
  });
  timelineHtml += '</div>';

  // Photo previews section (before / after)
  let photoGridHtml = "";
  if (issue.status === "Resolved" && issue.afterPhotoURL) {
    photoGridHtml = `
      <div class="modal-proof">
        <div class="proof-half">
          <div class="proof-title">Before (Reported)</div>
          <img class="preview-img" style="border-radius: var(--radius-md);" src="${issue.photoURL}" alt="Before repairs">
        </div>
        <div class="proof-half">
          <div class="proof-title" style="color: var(--success);">After (Resolved Proof)</div>
          <img class="preview-img" style="border-radius: var(--radius-md); border: 2px solid var(--success);" src="${issue.afterPhotoURL}" alt="After repairs">
        </div>
      </div>
    `;
  } else {
    photoGridHtml = `
      <div style="margin-top: 1rem; border-radius: var(--radius-md); overflow:hidden; max-height:220px;">
        <img class="preview-img" style="object-fit: cover;" src="${issue.photoURL}" alt="Issue photo">
      </div>
    `;
  }

  // Set card contents
  card.innerHTML = `
    <div style="padding: 1.5rem; border-bottom: 1px solid var(--border-light); background-color: var(--light-bg); display: flex; justify-content: space-between; align-items: center; flex-wrap:wrap; gap: 0.5rem;">
      <div>
        <span class="role-badge" style="background-color: var(--secondary); color: white; margin-right: 0.5rem;">${issue.category}</span>
        <span style="font-size: 0.85rem; color: var(--text-muted-dark); font-weight: 500;">Reported: ${dateStr}</span>
      </div>
      <div>
        <span class="issue-badge badge-${issue.status.toLowerCase().replace(" ", "")}">${issue.status}</span>
      </div>
    </div>
    <div style="padding: 1.5rem;">
      <div style="margin-bottom: 1rem;">
        <p style="font-weight: 500; font-size: 1.05rem;">Description:</p>
        <p style="color: var(--text-muted-dark); margin-top: 0.25rem;">${issue.description}</p>
      </div>
      
      ${dupBadgeHtml}
      
      ${timelineHtml}
      
      ${photoGridHtml}
      
      ${resolvedDateStr ? `
        <div style="margin-top:1rem; padding: 0.75rem; background-color: rgba(16, 185, 129, 0.08); border-radius: var(--radius-sm); border: 1px solid rgba(16, 185, 129, 0.2); font-size:0.85rem; color: var(--success-hover); font-weight:600; display:flex; align-items:center; gap:0.5rem;">
          🎉 This issue has been fully resolved on ${resolvedDateStr}. Thank you for your reporting action!
        </div>
      ` : ""}
    </div>
  `;

  return card;
}
