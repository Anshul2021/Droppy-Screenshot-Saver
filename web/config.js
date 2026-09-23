// Droppy Cloud Client Configuration
// You can replace these with your project values or enter them in the app settings modal.
window.DROPPY_CONFIG = {
  // Replace with your Supabase Project URL (e.g. 'https://your-project.supabase.co')
  supabaseUrl: window.localStorage.getItem('droppy_supabase_url') || '',
  
  // Replace with your Supabase Anon Key
  supabaseAnonKey: window.localStorage.getItem('droppy_supabase_anon_key') || ''
};
