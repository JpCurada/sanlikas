import React from 'react';

interface MapErrorBoundaryProps {
  /** Rendered when the subtree throws (e.g., native map init failure). */
  fallback: React.ReactNode;
  onError?: (error: Error) => void;
  children: React.ReactNode;
}

interface MapErrorBoundaryState {
  hasError: boolean;
}

/**
 * Error boundary around map initialization (US-1.1): if the 3D map subtree
 * throws, mount the 2D fallback instead of crashing or going blank.
 */
export class MapErrorBoundary extends React.Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  state: MapErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    console.warn('[map] map subtree crashed, falling back:', error);
    this.props.onError?.(error);
  }

  render(): React.ReactNode {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
