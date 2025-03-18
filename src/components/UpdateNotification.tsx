import React, { useEffect, useState } from 'react';

interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseName?: string;
}

interface ProgressInfo {
  percent: number;
  bytesPerSecond: number;
  total: number;
  transferred: number;
}

const UpdateNotification: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<ProgressInfo | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [showDevTools, setShowDevTools] = useState(false);
  const [autoInstall, setAutoInstall] = useState(false);

  useEffect(() => {
    // Add event listeners for update events
    window.electron.onUpdateAvailable((info) => {
      console.log('Update available:', info);
      setUpdateAvailable(info);
    });

    window.electron.onUpdateDownloaded((info) => {
      console.log('Update downloaded:', info);
      // If user clicked "Update Now" earlier, auto-install the update
      if (autoInstall) {
        window.electron.quitAndInstall();
      }
      // Otherwise, do nothing - we don't show the downloaded notification anymore
    });

    window.electron.onDownloadProgress((progressObj) => {
      console.log('Download progress:', progressObj);
      setDownloadProgress(progressObj);
    });

    window.electron.onUpdateError((message) => {
      console.error('Update error:', message);
      setUpdateError(message);
      setAutoInstall(false); // Reset auto-install flag on error
    });

    // Check for updates when component mounts
    window.electron.checkForUpdates()
      .catch((err) => {
        console.error('Error checking for updates:', err);
        // Don't show errors to users during automatic check
      });

    // Clean up event listeners on unmount
    return () => {
      window.electron.removeAllListeners();
    };
  }, [autoInstall]);

  // DEV ONLY: Toggle development testing tools with Alt+Shift+U (or Cmd+Ctrl+Shift+U on Mac)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+Shift+U on Windows/Linux or Cmd+Ctrl+Shift+U on Mac
      if ((e.altKey || (e.metaKey && e.ctrlKey)) && e.shiftKey && e.key === 'U') {
        setShowDevTools(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // DEV ONLY: Simulate update states for UI testing
  const simulateUpdateAvailable = () => {
    setUpdateAvailable({
      version: '1.2.0',
      releaseDate: new Date().toISOString(),
      releaseName: 'Test Release'
    });
    setDownloadProgress(null);
    setUpdateError(null);
  };

  const simulateDownloadProgress = () => {
    setUpdateAvailable(null);
    setDownloadProgress({
      percent: 45,
      bytesPerSecond: 1500000,
      total: 95000000,
      transferred: 42750000
    });
    setUpdateError(null);
  };

  const simulateUpdateError = () => {
    setUpdateAvailable(null);
    setDownloadProgress(null);
    setUpdateError('Failed to connect to update server. Check your network connection.');
  };

  const handleUpdate = () => {
    // Start download and set flag to auto-install when complete
    setAutoInstall(true);
    setUpdateAvailable(null);
    if (!downloadProgress) {
      setDownloadProgress({
        percent: 0,
        bytesPerSecond: 0,
        total: 100,
        transferred: 0
      });
    }
    // The actual download progress will be sent via events
    // When download completes, the app will restart automatically
  };

  if (updateError) {
    return (
      <div className="fixed bottom-4 right-4 bg-zinc-800 border border-zinc-700 text-zinc-200 px-4 py-3 rounded-md shadow-xl z-50 max-w-md">
        <h3 className="font-medium text-red-400">Update Error</h3>
        <p className="text-sm text-zinc-300 mt-1">{updateError}</p>
        <button 
          onClick={() => setUpdateError(null)}
          className="mt-3 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-medium py-1.5 px-3 rounded-md text-xs w-full transition-colors"
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (downloadProgress) {
    const percent = Math.round(downloadProgress.percent);
    const downloaded = (downloadProgress.transferred / 1048576).toFixed(2);
    const total = (downloadProgress.total / 1048576).toFixed(2);
    const speed = (downloadProgress.bytesPerSecond / 1048576).toFixed(2);
    
    return (
      <div className="fixed bottom-4 right-4 bg-zinc-800 border border-zinc-700 text-zinc-200 px-4 py-3 rounded-md shadow-xl z-50 max-w-md">
        <h3 className="font-medium text-blue-400">Downloading Update</h3>
        <p className="text-sm text-zinc-300 mb-2 mt-1">
          {downloaded} MB / {total} MB ({speed} MB/s)
        </p>
        <div className="w-full bg-zinc-700 rounded-full h-2">
          <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${percent}%` }}></div>
        </div>
        <div className="flex justify-between items-center mt-1">
          <p className="text-xs text-zinc-400">App will restart when complete</p>
          <p className="text-xs text-zinc-300 font-medium">{percent}%</p>
        </div>
      </div>
    );
  }

  if (updateAvailable) {
    return (
      <div className="fixed bottom-4 right-4 bg-zinc-800 border border-zinc-700 text-zinc-200 px-4 py-3 rounded-md shadow-xl z-50 max-w-md">
        <h3 className="font-medium text-blue-400">Update Available</h3>
        <p className="text-sm text-zinc-300 mt-1">Version {updateAvailable.version} is available</p>
        <div className="flex gap-2 mt-3">
          <button 
            onClick={handleUpdate}
            className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-1.5 px-3 rounded-md text-xs flex-1 transition-colors"
          >
            Update Now
          </button>
          <button 
            onClick={() => setUpdateAvailable(null)}
            className="bg-zinc-700 hover:bg-zinc-600 text-zinc-300 font-medium py-1.5 px-3 rounded-md text-xs transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    );
  }

  // DEV ONLY: Show development testing UI
  if (showDevTools) {
    return (
      <div className="fixed bottom-4 right-4 bg-zinc-900 border border-zinc-800 text-zinc-200 px-4 py-3 rounded-md shadow-xl z-50">
        <h3 className="font-medium text-zinc-200 mb-2">Update UI Testing</h3>
        <div className="grid grid-cols-2 gap-2">
          <button 
            onClick={simulateUpdateAvailable}
            className="bg-zinc-800 hover:bg-zinc-700 text-blue-400 font-medium py-1.5 px-2 rounded-md text-xs transition-colors"
          >
            Available
          </button>
          <button 
            onClick={simulateDownloadProgress}
            className="bg-zinc-800 hover:bg-zinc-700 text-blue-400 font-medium py-1.5 px-2 rounded-md text-xs transition-colors"
          >
            Downloading
          </button>
          <button 
            onClick={simulateUpdateError}
            className="bg-zinc-800 hover:bg-zinc-700 text-red-400 font-medium py-1.5 px-2 rounded-md text-xs transition-colors col-span-2"
          >
            Error
          </button>
        </div>
        <button 
          onClick={() => setShowDevTools(false)}
          className="mt-3 w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-1.5 px-2 rounded-md text-xs transition-colors"
        >
          Hide Tools
        </button>
        <p className="text-xs mt-2 text-zinc-500">
          {navigator.platform.includes('Mac') 
            ? 'Press Cmd+Ctrl+Shift+U to toggle this panel' 
            : 'Press Alt+Shift+U to toggle this panel'}
        </p>
      </div>
    );
  }

  // Return nothing when no update is available (no permanent button)
  return null;
};

export default UpdateNotification; 