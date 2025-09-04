# Sunnylink

A modern web application showcasing sunnypilot features and providing
information about the open-source driving assistance software. Built with
SvelteKit, TypeScript, and Tailwind CSS.

## Features

- **Interactive Dashboard**: Mock driving statistics and engagement metrics
- **Feature Showcase**: Highlights of key sunnypilot features (DEC, MADS, FCR)
- **Branch Information**: Detailed explanations of Release, Staging, and Dev
  branches
- **FAQ Section**: Common questions and community resources
- **Responsive Design**: Mobile-first approach with DaisyUI components
- **Authentication**: Integrated with Logto for user management
- **Theme Toggle**: Support for light/dark mode switching

## Tech Stack

- **Framework**: SvelteKit 2.x with TypeScript
- **Styling**: Tailwind CSS 4.0 + DaisyUI 5.0
- **Authentication**: Logto SvelteKit integration
- **Testing**: Vitest + Playwright for E2E testing
- **Build**: Vite 6.0
- **Deployment**: Fly.io with Docker
- **Package Manager**: pnpm

## Quick Start

### Prerequisites

- Node.js 22.x or higher
- pnpm package manager

### Installation

1. Clone the repository:

```bash
git clone https://github.com/your-username/sunnylink.git
cd sunnylink
```

2. Install dependencies:

```bash
pnpm install
```

3. Copy environment configuration:

```bash
cp .env.example .env
```

4. Update environment variables in `.env`:

```env
PUBLIC_API_URL=https://stg.api.sunnypilot.ai/
PUBLIC_LOGTO_ENDPOINT=https://logto.sunnypilot.ai/
PUBLIC_LOGTO_APP_ID=your-app-id
PUBLIC_CALLBACK=http://localhost:5173/sunnylink-svelte/callback
PUBLIC_REDIRECT=http://localhost:5173/
```

### Development

Start the development server:

```bash
pnpm dev
```

The application will be available at `http://localhost:5173/sunnylink-svelte/`

## Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm preview` - Preview production build
- `pnpm check` - Run TypeScript and Svelte checks
- `pnpm lint` - Run linting and formatting checks
- `pnpm format` - Format code with Prettier
- `pnpm test` - Run all tests
- `pnpm test:unit` - Run unit tests with Vitest
- `pnpm test:e2e` - Run end-to-end tests with Playwright

## Project Structure

```
src/
├── lib/
│   ├── api/           # API client and authentication
│   ├── components/    # Reusable Svelte components
│   ├── images/        # Static images and assets
│   ├── types/         # TypeScript type definitions
│   └── utils/         # Utility functions
├── routes/
│   ├── +layout.svelte # Root layout
│   ├── +page.svelte   # Homepage
│   ├── callback/      # Auth callback route
│   └── dashboard/     # Protected dashboard area
└── app.html           # HTML template
```

## Authentication

The application uses Logto for authentication with the following flow:

1. Users authenticate via Logto
2. Callback handles the authentication response
3. Protected routes require valid session
4. Dashboard area shows user-specific content

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

This project is private and proprietary to the sunnypilot organization.

## Related Projects

- [sunnypilot](https://github.com/sunnypilot/sunnypilot) - The main sunnypilot
  driving assistance software
- [sunnypilot Discord](https://discord.gg/7wq8zuxB) - Community support and
  discussions

## Support

For support and community discussions, join the
[sunnypilot Discord server](https://discord.gg/7wq8zuxB).
