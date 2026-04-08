/**
 * Production Error Boundary
 *
 * Wraps critical UI sections to prevent full-app crashes.
 * Shows a recovery UI and logs the error.
 *
 * When Sentry is configured, add reporting here (see docs/SENTRY_SETUP.md).
 */

import React from "react";
import { Pressable, Text, View } from "react-native";

interface Props {
  children: React.ReactNode;
  /** Label for identifying which section crashed */
  section: string;
  /** Optional fallback UI; default is a retry button */
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ProductionErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[ErrorBoundary:${this.props.section}]`,
      error,
      info.componentStack,
    );
    // TODO: Report to Sentry when configured (see docs/SENTRY_SETUP.md)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View className="flex-1 items-center justify-center bg-background p-6">
          <Text className="text-lg font-bold text-destructive mb-2">
            Something went wrong
          </Text>
          <Text className="text-sm text-muted-foreground text-center mb-4">
            {this.props.section} encountered an error.
            {__DEV__ && this.state.error
              ? `\n\n${this.state.error.message}`
              : ""}
          </Text>
          <Pressable
            onPress={this.handleRetry}
            className="bg-primary px-6 py-3 rounded-lg"
          >
            <Text className="text-primary-foreground font-semibold">
              Try Again
            </Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}
