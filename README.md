# sunnylink

Remote management platform for **comma devices running [sunnypilot](https://github.com/sunnypilot/sunnypilot)** - an open-source driver assistance system forked.

## What It Is

sunnylink is a web-based control center that allows you to remotely manage comma devices running sunnypilot from anywhere in the world. Configure settings, switch driving models, monitor device status, and backup configurations through a secure, modern interface.

## Technology Stack

- **Framework**: SvelteKit with Svelte 5 (runes)
- **Language**: TypeScript with strict mode
- **Styling**: Tailwind CSS + DaisyUI components
- **Authentication**: Logto SSO integration
- **API**: OpenAPI-generated TypeScript clients
- **PWA**: Progressive Web App with service worker

## Key Features

### Device Management

- Multi-device support with online/offline status monitoring
- Custom device aliasing and organization
- Real-time device communication via websockets
- Device registration, deregistration, and migration

### Remote Settings Configuration

- **Configurable parameters** across 7 categories:
  - **Device**: Core settings (language, units, recording)
  - **Toggles**: Feature switches and experimental modes
  - **Steering**: Advanced steering control (MADS, torque, neural control)
  - **Cruise**: Speed control and adaptive cruise settings
  - **Visuals**: UI customization and display preferences
  - **Developer**: Advanced debugging and development tools
  - **Other**: Navigation, maps, and system settings

### Model Management

- Browse and switch between driving models
- Model metadata display (runner, generation, build time)
- Offroad mode enforcement for safety
- Force offroad option with warnings

### Backup & Migration

- Complete device settings backup as JSON
- Settings migration between devices
- Progress tracking for all operations

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Run type checking
pnpm check

# Run tests
pnpm test
```

## Project Structure

```
src/
├── routes/           # SvelteKit pages and layouts
├── components/       # Reusable UI components
├── lib/
│   ├── api/         # OpenAPI client wrappers and device functions
│   ├── stores/      # Svelte reactive state
│   ├── types/       # TypeScript type definitions
│   └── utils/       # Utility functions
└── sunnylink/       # API schemas (v0, v1)
```

## Development

- Uses Svelte 5 runes (`$state`, `$derived`, `$effect`) for reactive state management
- OpenAPI schemas in `sunnylink/` directory with custom client wrappers
- Prettier with tabs, single quotes, 100 char width
- Dark theme with responsive design for mobile and desktop
