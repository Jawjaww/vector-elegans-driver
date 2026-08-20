jest.mock('../supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
    channel: jest.fn(),
  },
}));
