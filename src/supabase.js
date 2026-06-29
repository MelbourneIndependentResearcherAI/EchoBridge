import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || "https://hrhkkmxhmiahggmlnizp.supabase.co",
  import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyaGtrbXhobWlhaGdnbWxuaXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NTAxNDEsImV4cCI6MjA5ODIyNjE0MX0.PuesUqKq0J869ZnsdC4NIfVnj0CIDDCDgHmNTlNVtuw"
);
