Fixed trigger function - Cast driver_status enum to text in 20260227120000_add_driver_submission_logs.sql
✅ Fixed seed.sql - Added missing users (client2, client3, client4) to auth.users, public.users, and user_profiles
✅ Updated .env - Set correct Supabase URL (http://10.248.132.240:54329) and anon key
✅ Rebuilt containers - App is now running with correct configuration
Test Users (all with password: password123)
Email Role
admin1@elegance-mobilite.local (mailto:admin1@elegance-mobilite.local) Super Admin
admin2@elegance-mobilite.local (mailto:admin2@elegance-mobilite.local) Admin
jean.dupont@elegance-mobilite.local (mailto:jean.dupont@elegance-mobilite.local) Driver (active)
marie.martin@elegance-mobilite.local (mailto:marie.martin@elegance-mobilite.local) Driver (active)
pierre.bernard@elegance-mobilite.local (mailto:pierre.bernard@elegance-mobilite.local) Driver (pending_validation)
client1@elegance-mobilite.local (mailto:client1@elegance-mobilite.local) Customer
client2@elegance-mobilite.local (mailto:client2@elegance-mobilite.local) Customer
client3@elegance-mobilite.local (mailto:client3@elegance-mobilite.local) Customer
client4@elegance-mobilite.local (mailto:client4@elegance-mobilite.local) Customer
