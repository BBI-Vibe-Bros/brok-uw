(function () {
  "use strict";

  var DEFAULTS = {
    position: "bottom-right",
    width: "400px",
    height: "620px",
    buttonSize: "56px",
    zIndex: 99999,
    accentColor: "#2563eb",
  };

  var script = document.currentScript;
  var baseUrl = script?.getAttribute("data-base-url") || script?.src.replace(/\/widget\.js.*$/, "") || "";
  var token = script?.getAttribute("data-token") || "";
  var position = script?.getAttribute("data-position") || DEFAULTS.position;
  var open = false;

  // --- Styles ---
  var style = document.createElement("style");
  style.textContent = [
    ".brokuw-widget-btn{",
    "  position:fixed;bottom:20px;",
    position === "bottom-left" ? "left:20px;" : "right:20px;",
    "  width:" + DEFAULTS.buttonSize + ";height:" + DEFAULTS.buttonSize + ";",
    "  border-radius:50%;border:none;cursor:pointer;",
    "  background:" + DEFAULTS.accentColor + ";color:#fff;",
    "  box-shadow:0 4px 12px rgba(0,0,0,.15);",
    "  z-index:" + DEFAULTS.zIndex + ";",
    "  display:flex;align-items:center;justify-content:center;",
    "  transition:transform .2s ease,box-shadow .2s ease;",
    "}",
    ".brokuw-widget-btn:hover{transform:scale(1.08);box-shadow:0 6px 20px rgba(0,0,0,.2)}",
    ".brokuw-widget-btn svg{width:24px;height:24px}",
    ".brokuw-widget-frame{",
    "  position:fixed;bottom:88px;",
    position === "bottom-left" ? "left:20px;" : "right:20px;",
    "  width:" + DEFAULTS.width + ";height:" + DEFAULTS.height + ";",
    "  max-width:calc(100vw - 40px);max-height:calc(100dvh - 108px);",
    "  border:none;border-radius:12px;overflow:hidden;",
    "  box-shadow:0 8px 30px rgba(0,0,0,.18);",
    "  z-index:" + DEFAULTS.zIndex + ";",
    "  display:none;",
    "  transition:opacity .2s ease,transform .2s ease;",
    "}",
    ".brokuw-widget-frame.open{display:block}",
    "@media(max-width:480px){",
    "  .brokuw-widget-frame{inset:0;width:100%;height:100%;max-width:100%;max-height:100%;border-radius:0;bottom:0}",
    "}",
  ].join("\n");
  document.head.appendChild(style);

  // --- Button ---
  var btn = document.createElement("button");
  btn.className = "brokuw-widget-btn";
  btn.setAttribute("aria-label", "Open BrokUW chat");
  btn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"/>' +
    "</svg>";
  document.body.appendChild(btn);

  // --- Iframe ---
  var frame = document.createElement("iframe");
  frame.className = "brokuw-widget-frame";
  var src = baseUrl + "/chat?embed=true";
  if (token) src += "&token=" + encodeURIComponent(token);
  frame.src = src;
  frame.setAttribute("allow", "clipboard-write");
  document.body.appendChild(frame);

  // --- Toggle ---
  btn.addEventListener("click", function () {
    open = !open;
    frame.classList.toggle("open", open);
    btn.innerHTML = open
      ? '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"/></svg>';
    btn.setAttribute("aria-label", open ? "Close BrokUW chat" : "Open BrokUW chat");
  });

  // --- Listen for postMessage from iframe ---
  window.addEventListener("message", function (e) {
    if (e.data?.type === "brok-uw-results") {
      var event = new CustomEvent("brokuw:results", { detail: e.data });
      window.dispatchEvent(event);
    }
  });
})();
