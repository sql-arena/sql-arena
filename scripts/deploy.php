<?php
// Simple remote deploy script for cPanel shared hosting
$zipFile = __DIR__ . '/build.zip';
$extractTo = __DIR__;

header('Content-Type: text/plain');

if (!file_exists($zipFile)) {
    http_response_code(404);
    exit("❌ build.zip not found\n");
}

$zip = new ZipArchive;
if ($zip->open($zipFile) === TRUE) {
    $zip->extractTo($extractTo);
    $zip->close();
    unlink($zipFile);  // optional cleanup
    unlink(__FILE__);  // delete this script after extraction
    echo "✅ Deployment complete\n";
} else {
    http_response_code(500);
    exit("❌ Failed to open build.zip\n");
}
?>
