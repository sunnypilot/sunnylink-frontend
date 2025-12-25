export interface OSMRegion {
    ref: string;
    display_name: string;
    full_name?: string;
}

export interface OSMDownloadProgress {
    total_files: number;
    downloaded_files: number;
    download_size: number;
    time_remaining: number;
}
