# MCP Server for Atlassian Confluence

An MCP (Model Context Protocol) server that enables AI assistants to interact with Atlassian Confluence pages. This server allows AI models to search, read, and navigate Confluence spaces directly.

## Features

- 🔍 Search Confluence pages using CQL (Confluence Query Language)
- 📄 Retrieve page content by ID or title
- 📁 List all pages in a space
- 🌳 Get child pages of any page
- 🔐 Secure authentication using API tokens

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Atlassian Confluence account with API access
- Confluence API token

## Installation

### Option 1: Install from source

1. Clone the repository:
```bash
git clone https://github.com/YOUR-USERNAME/mcp-server-confluence.git
cd mcp-server-confluence