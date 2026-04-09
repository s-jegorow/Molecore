"""
Demo page content - seeded once on first backend startup for unauthenticated visitors.
"""

DEMO_USER_ID = "demo"

_DEMO_CONTENT_HOME = {
    "time": 1712188800000,
    "blocks": [
        {"type": "header", "data": {"text": "Welcome to Molecore", "level": 1}},
        {"type": "paragraph", "data": {"text": "Molecore is a self-hostable, open-source note-taking app. Your notes stay on your own server - no third-party cloud required."}},
        {"type": "callout", "data": {"fk": "callout-home1", "items": 1, "color": "blue"}},
        {"type": "paragraph", "data": {"text": "You are currently in <b>demo mode</b>. Feel free to explore the editor - changes are not saved."}},
        {"type": "header", "data": {"text": "Explore", "level": 2}},
        {"type": "list", "data": {"style": "unordered", "items": [
            {"content": "📖 What is Molecore - features &amp; overview", "items": []},
            {"content": "🛠️ How to use this thing - editor guide", "items": []},
            {"content": "📋 Version History - changelog", "items": []}
        ]}}
    ],
    "version": "2.28.2"
}

_DEMO_CONTENT_WHAT = {
    "time": 1712188800000,
    "blocks": [
        {"type": "header", "data": {"text": "What is Molecore", "level": 1}},
        {"type": "callout", "data": {"fk": "callout-what1", "items": 1, "color": "blue"}},
        {"type": "paragraph", "data": {"text": "Molecore is a note-taking app designed for people who want full control over their data and don't want collaboration or bloated AI features. It runs on your own server via Docker and uses Keycloak for authentication."}},
        {"type": "callout", "data": {"fk": "callout-what2", "items": 2, "color": "blue"}},
        {"type": "header", "data": {"text": "Features", "level": 2}},
        {"type": "list", "data": {"style": "unordered", "items": [
            {"content": "Rich block editor - headings, lists, code, tables, callouts, toggles, images, audio, files, embeds", "items": []},
            {"content": "Page hierarchy - nest pages inside pages", "items": []},
            {"content": "Favorites - pin important pages to the top of your sidebar", "items": []},
            {"content": "Header images per page", "items": []},
            {"content": "Notepad - a persistent scratch pad always accessible from the sidebar", "items": []},
            {"content": "Focus Timer - Pomodoro-style timer", "items": []},
            {"content": "Todo - built-in task list", "items": []},
            {"content": "Calendar - simple event planner", "items": []},
            {"content": "Notion Import - migrate your existing notes", "items": []},
            {"content": "Dark mode &amp; Grain mode", "items": []}
        ]}},
        {"type": "callout", "data": {"fk": "callout-what3", "items": 2, "color": "blue"}},
        {"type": "header", "data": {"text": "Self-Hosting", "level": 2}},
        {"type": "paragraph", "data": {"text": "Molecore is open source and available on GitHub. You can run it on your own server using Docker Compose. Authentication is handled by Keycloak. Check the README for setup instructions."}}
    ],
    "version": "2.28.2"
}

_DEMO_CONTENT_HOW = {
    "time": 1712188800000,
    "blocks": [
        {"type": "header", "data": {"text": "How to use this thing", "level": 1}},
        {"type": "callout", "data": {"fk": "callout-how1", "items": 2, "color": "blue"}},
        {"type": "header", "data": {"text": "Navigation", "level": 2}},
        {"type": "paragraph", "data": {"text": "Tap the logo in the bottom bar to open the sidebar. From there you can create new pages, navigate between pages, and access favorites."}},
        {"type": "callout", "data": {"fk": "callout-how2", "items": 2, "color": "blue"}},
        {"type": "header", "data": {"text": "The Editor", "level": 2}},
        {"type": "paragraph", "data": {"text": "Click anywhere on the page to start writing. Type <b>/</b> to open the block picker and insert a new block type. Drag the handle on the left of any block to reorder it."}},
        {"type": "callout", "data": {"fk": "callout-how3", "items": 2, "color": "blue"}},
        {"type": "header", "data": {"text": "Block Types", "level": 2}},
        {"type": "list", "data": {"style": "unordered", "items": [
            {"content": "<b>Paragraph</b> - plain text with inline formatting (bold, italic, color, highlight, links)", "items": []},
            {"content": "<b>Heading</b> - H1, H2, H3", "items": []},
            {"content": "<b>List</b> - unordered, ordered, or checklist", "items": []},
            {"content": "<b>Callout</b> - highlight a section with a colored border", "items": []},
            {"content": "<b>Toggle</b> - collapsible content block", "items": []},
            {"content": "<b>Code</b> - syntax-highlighted code block", "items": []},
            {"content": "<b>Table</b> - simple grid", "items": []},
            {"content": "<b>Image</b> - upload or drag &amp; drop, resizable", "items": []},
            {"content": "<b>Audio</b>, <b>File</b>, <b>Embed</b>", "items": []}
        ]}},
        {"type": "header", "data": {"text": "Toolbar", "level": 2}},
        {"type": "image", "data": {"url": "/toolbar.png", "width": 25}},
        {"type": "callout", "data": {"fk": "callout-how5", "items": 3, "color": "blue"}},
        {"type": "header", "data": {"text": "Sidebar Tools", "level": 2}},
        {"type": "list", "data": {"style": "unordered", "items": [
            {"content": "<b>Notepad</b> - quick scratch pad, always accessible", "items": []},
            {"content": "<b>Timer</b> - focus timer with custom intervals", "items": []},
            {"content": "<b>Todo</b> - persistent task list", "items": []},
            {"content": "<b>Calendar</b> - simple event calendar", "items": []}
        ]}},
        {"type": "paragraph", "data": {"text": "Access all tools from the icon bar at the bottom of the sidebar."}}
    ],
    "version": "2.28.2"
}

_DEMO_CONTENT_HISTORY = {
    "time": 1712188800000,
    "blocks": [
        {"type": "header", "data": {"text": "Version History", "level": 1}},
        {"type": "callout", "data": {"fk": "callout-hist1", "items": 2, "color": "green"}},
        {"type": "header", "data": {"text": "v1.0 - April 2026", "level": 3}},
        {"type": "paragraph", "data": {"text": "Performance fix: pages with multiple subpages now load all at once instead of one by one. Stable for daily use."}},
        {"type": "callout", "data": {"fk": "callout-hist2", "items": 2, "color": "blue"}},
        {"type": "header", "data": {"text": "v0.9 - April 2026", "level": 3}},
        {"type": "paragraph", "data": {"text": "Toolbox added for quick access to tools. Notion importer added. Callout blocks improved. Various design fixes."}},
        {"type": "callout", "data": {"fk": "callout-hist3", "items": 2, "color": "blue"}},
        {"type": "header", "data": {"text": "v0.8 - March 2026", "level": 3}},
        {"type": "paragraph", "data": {"text": "New tools: Timer and Calendar. Token validation fix. Mobile view improvements."}},
        {"type": "callout", "data": {"fk": "callout-hist4", "items": 2, "color": "blue"}},
        {"type": "header", "data": {"text": "v0.7 - March 2026", "level": 3}},
        {"type": "paragraph", "data": {"text": "Notepad added. Grain effect and new options. Full toolbar redesign."}},
        {"type": "callout", "data": {"fk": "callout-hist5", "items": 2, "color": "blue"}},
        {"type": "header", "data": {"text": "v0.6 - March 2026", "level": 3}},
        {"type": "paragraph", "data": {"text": "Callout blocks: multiple blocks can now be combined into a callout. Sidebar updates after deleting a page."}},
        {"type": "callout", "data": {"fk": "callout-hist6", "items": 2, "color": "blue"}},
        {"type": "header", "data": {"text": "v0.5 - February 2026", "level": 3}},
        {"type": "paragraph", "data": {"text": "Mobile navigation. Major refactoring. Various new features and stability improvements."}},
        {"type": "callout", "data": {"fk": "callout-hist7", "items": 2, "color": "blue"}},
        {"type": "header", "data": {"text": "v0.4 - January 2026", "level": 3}},
        {"type": "paragraph", "data": {"text": "New block types added. Page header images. Page icons. First settings screen."}},
        {"type": "callout", "data": {"fk": "callout-hist8", "items": 2, "color": "blue"}},
        {"type": "header", "data": {"text": "v0.3 - January 2026", "level": 3}},
        {"type": "paragraph", "data": {"text": "Image blocks added. Text highlights and font colors."}},
        {"type": "callout", "data": {"fk": "callout-hist9", "items": 2, "color": "blue"}},
        {"type": "header", "data": {"text": "v0.2 - January 2026", "level": 3}},
        {"type": "paragraph", "data": {"text": "Multi-page support with sidebar navigation. Drag and drop for blocks."}},
        {"type": "callout", "data": {"fk": "callout-hist10", "items": 2, "color": "lightgray"}},
        {"type": "header", "data": {"text": "v0.1 - January 2026", "level": 3}},
        {"type": "paragraph", "data": {"text": "Initial release. Basic editor with backend and frontend setup."}}
    ],
    "version": "2.28.2"
}

DEMO_PAGES_SEED = [
    {"title": "What is Molecore",      "page_type": "normal", "icon": "📖", "order": 0, "content": _DEMO_CONTENT_WHAT,    "header": "/molecoreheader.png"},
    {"title": "How to use this thing", "page_type": "normal", "icon": "🛠️", "order": 1, "content": _DEMO_CONTENT_HOW,     "header": "/molecoreheader.png"},
    {"title": "Version History",       "page_type": "normal", "icon": "📋", "order": 2, "content": _DEMO_CONTENT_HISTORY, "header": "/molecoreheader.png"},
]
