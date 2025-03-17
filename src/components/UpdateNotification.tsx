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
  const [updateDownloaded, setUpdateDownloaded] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<ProgressInfo | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    // Add event listeners for update events
    window.electron.onUpdateAvailable((info) => {
      console.log('Update available:', info);
      setUpdateAvailable(info);
    });

    window.electron.onUpdateDownloaded((info) => {
      console.log('Update downloaded:', info);
      setUpdateDownloaded(info);
      // Reset progress when download is complete
      setDownloadProgress(null);
    });

    window.electron.onDownloadProgress((progressObj) => {
      console.log('Download progress:', progressObj);
      setDownloadProgress(progressObj);
    });

    window.electron.onUpdateError((message) => {
      console.error('Update error:', message);
      setUpdateError(message);
    });

    // Clean up event listeners on unmount
    return () => {
      window.electron.removeAllListeners();
    };
  }, []);

  const checkForUpdates = () => {
    setUpdateError(null);
    window.electron.checkForUpdates()
      .catch((err) => {
        console.error('Error checking for updates:', err);
        setUpdateError(err.toString());
      });
  };

  const installUpdate = () => {
    window.electron.quitAndInstall();
  };

  if (updateError) {
    return (
      <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow-lg z-50 max-w-md">
        <h3 className="font-bold">Update Error</h3>
        <p className="text-sm">{updateError}</p>
        <button 
          onClick={() => setUpdateError(null)}
          className="mt-2 bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded text-xs"
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (updateDownloaded) {
    return (
      <div className="fixed bottom-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded shadow-lg z-50 max-w-md">
        <h3 className="font-bold">Update Ready</h3>
        <p className="text-sm">Version {updateDownloaded.version} is ready to install.</p>
        <button 
          onClick={installUpdate}
          className="mt-2 bg-green-500 hover:bg-green-700 text-white font-bold py-1 px-2 rounded text-xs mr-2"
        >
          Restart & Install
        </button>
        <button 
          onClick={() => setUpdateDownloaded(null)}
          className="mt-2 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-1 px-2 rounded text-xs"
        >
          Later
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
      <div className="fixed bottom-4 right-4 bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded shadow-lg z-50 max-w-md">
        <h3 className="font-bold">Downloading Update</h3>
        <p className="text-sm mb-1">
          {downloaded} MB / {total} MB ({speed} MB/s)
        </p>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${percent}%` }}></div>
        </div>
        <p className="text-right text-xs mt-1">{percent}%</p>
      </div>
    );
  }

  if (updateAvailable) {
    return (
      <div className="fixed bottom-4 right-4 bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded shadow-lg z-50 max-w-md">
        <h3 className="font-bold">Update Available</h3>
        <p className="text-sm">Version {updateAvailable.version} is available.</p>
        <button 
          onClick={() => setUpdateAvailable(null)}
          className="mt-2 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-1 px-2 rounded text-xs"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4">
      <button 
        onClick={checkForUpdates}
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded shadow-lg"
      >
        Check for Updates
      </button>
    </div>
  );
};

export default UpdateNotification; 