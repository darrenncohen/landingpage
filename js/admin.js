(function () {
  var form = document.getElementById("admin-publish-form");
  var statusBox = document.getElementById("admin-status");
  var endpointInput = document.getElementById("admin-endpoint");

  function setStatus(message, kind) {
    statusBox.textContent = message;
    statusBox.className = "admin-status " + (kind || "");
  }

  function loadSavedEndpoint() {
    var saved = localStorage.getItem("admin-api-endpoint");
    if (saved && !endpointInput.value) {
      endpointInput.value = saved;
    }
  }

  async function submitForm(event) {
    event.preventDefault();
    var endpoint = endpointInput.value.trim();
    if (!endpoint) {
      setStatus("Set the API endpoint first.", "error");
      return;
    }
    localStorage.setItem("admin-api-endpoint", endpoint);

    var data = new FormData(form);
    var publishMicro = data.get("publishMicroblog") === "on";
    var publishPhoto = data.get("publishPhotoStream") === "on";
    if (!publishMicro && !publishPhoto) {
      setStatus("Pick at least one destination.", "error");
      return;
    }

    setStatus("Publishing...", "pending");
    try {
      var response = await fetch(endpoint, {
        method: "POST",
        body: data
      });
      var payload = await response.json().catch(function () {
        return null;
      });
      if (!response.ok) {
        throw new Error((payload && payload.error) || "Request failed");
      }

      var summary = [];
      if (payload.photo) {
        summary.push("Photo queued: " + payload.photo.incomingPath);
      }
      if (payload.microblog) {
        summary.push("Microblog published: " + payload.microblog.id);
      }
      if (payload.crosspost && payload.crosspost.length) {
        summary.push("Cross-posted: " + payload.crosspost.join(", "));
      }
      setStatus(summary.join(" | ") || "Done", "success");
      form.reset();
      endpointInput.value = endpoint;
    } catch (err) {
      setStatus(err.message || "Publish failed", "error");
    }
  }

  if (form) {
    loadSavedEndpoint();
    form.addEventListener("submit", submitForm);
  }
})();
