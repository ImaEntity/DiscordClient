const {app, BrowserWindow} = require("electron");

app.whenReady().then(function() {
    const win = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 900,
        minHeight: 500,
        webPreferences: {
            devTools: true,
            nodeIntegration: true
        }
    });
    
    // Don't forget to set this Time
    win.loadFile();
    
    win.removeMenu();
});

app.on("window-all-closed", function() {
    if(process.platform != "darwin")
        app.quit();
});
