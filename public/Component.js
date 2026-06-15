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

      // Load index.css dynamically if not already loaded
      var sCssId = "ztbl-maintenance-css";
      if (!document.getElementById(sCssId)) {
        var oLink = document.createElement("link");
        oLink.id = sCssId;
        oLink.rel = "stylesheet";
        oLink.type = "text/css";
        oLink.href = sModulePath + "/index.css";
        document.head.appendChild(oLink);
      }

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

          if (window.ZtblMaintenanceApp) {
            mountApp();
          } else {
            // Load index.js dynamically if not already loaded
            var sScriptId = "ztbl-maintenance-js";
            var oScript = document.getElementById(sScriptId);
            if (!oScript) {
              oScript = document.createElement("script");
              oScript.id = sScriptId;
              oScript.type = "module"; // Critical for loading Vite-compiled ESM bundle
              oScript.src = sModulePath + "/index.js";
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
