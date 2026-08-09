# Northgrain LinkedIn extension

This directory is a shared WebExtension source for Chrome and Safari.

Chrome: open `chrome://extensions`, enable Developer mode, choose Load unpacked, and select this directory.

Safari: create a Safari Web Extension target in Xcode and point it at these shared extension files. Configure the published extension origin in `EXTENSION_ORIGINS`.

The extension reads the active tab URL only. Names, titles, companies and connection state are manually confirmed before the CRM API is called. It never scrapes the LinkedIn DOM or sends LinkedIn messages.
