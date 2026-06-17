/* global sap */
sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/core/HTML"
], function (UIComponent, HTML) {
  "use strict";

  return UIComponent.extend("ztbl.maintenance.ui.Component", {
    metadata: {
      manifest: "json"
    },

    init: function () {
      UIComponent.prototype.init.apply(this, arguments);
    },

    createContent: function () {
      var sModulePath = sap.ui.require.toUrl("ztbl/maintenance/ui");
      var sComponentId = this.getId();
      var sAppVersion = "20260617-1745";

      // Load index.css dynamically if not already loaded
      var sCssId = "ztbl-maintenance-css";
      var oLink = document.getElementById(sCssId);
      if (!oLink) {
        oLink = document.createElement("link");
        oLink.id = sCssId;
        oLink.rel = "stylesheet";
        oLink.type = "text/css";
        oLink.href = sModulePath + "/index.css?v=" + sAppVersion;
        document.head.appendChild(oLink);
      } else if (oLink.getAttribute("data-version") !== sAppVersion) {
        oLink.href = sModulePath + "/index.css?v=" + sAppVersion;
      }
      oLink.setAttribute("data-version", sAppVersion);

      // Generate a unique ID for the container element to avoid collisions in Fiori Launchpad
      var sContainerId = sComponentId + "-react-root";

      var oHtml = new HTML({
        content: '<div id="' + sContainerId + '" style="height: 100%; width: 100%;"></div>',
        afterRendering: function () {
          var oContainer = document.getElementById(sContainerId);
          if (!oContainer) return;

          function mountApp() {
            if (window.ZtblMaintenanceApp && window.ZtblMaintenanceApp.mount) {
              window.ZtblMaintenanceApp.mount(oContainer);
            }
          }

          if (window.ZtblMaintenanceApp && window.ZtblMaintenanceApp.version === sAppVersion) {
            mountApp();
          } else {
            // Load index.js dynamically if not already loaded
            var sScriptId = "ztbl-maintenance-js";
            var oScript = document.getElementById(sScriptId);
            if (oScript && oScript.getAttribute("data-version") !== sAppVersion) {
              oScript.parentNode.removeChild(oScript);
              oScript = null;
              window.ZtblMaintenanceApp = null;
            }

            if (!oScript) {
              oScript = document.createElement("script");
              oScript.id = sScriptId;
              oScript.setAttribute("data-version", sAppVersion);
              oScript.type = "module"; // Critical for loading Vite-compiled ESM bundle
              oScript.src = sModulePath + "/index.js?v=" + sAppVersion;
              oScript.onload = mountApp;
              document.body.appendChild(oScript);
            } else {
              // If the script tag is already injected but the library is not yet loaded, wait for it
              var interval = setInterval(function () {
                if (window.ZtblMaintenanceApp) {
                  clearInterval(interval);
                  mountApp();
                }
              }, 50);
            }
          }
        }
      });

      return oHtml;
    },

    destroy: function () {
      // Unmount the React app when the component is destroyed (e.g. user navigates away)
      if (window.ZtblMaintenanceApp && window.ZtblMaintenanceApp.unmount) {
        window.ZtblMaintenanceApp.unmount();
      }
      UIComponent.prototype.destroy.apply(this, arguments);
    }
  });
});
