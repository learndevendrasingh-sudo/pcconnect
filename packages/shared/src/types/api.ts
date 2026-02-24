// Minimal API types — no REST API needed for anonymous flow
// Kept for potential future use

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}
