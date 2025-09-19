import { query } from './lib/db/postgres.js';

async function testSMS() {
  console.log('🧪 Testing SMS Integration...\n');
  
  try {
    // Check SMS rules
    const { rows: rules } = await query('SELECT rule_key, title, trigger_type, league, template, active FROM sms_rules WHERE trigger_type = $1 AND active = TRUE ORDER BY league NULLS LAST', ['pack_open']);
    console.log('1️⃣ SMS Rules:', rules.length > 0 ? rules : 'None found');
    
    // Check notification preferences
    const { rows: prefs } = await query('SELECT COUNT(*) as count, league FROM notification_preferences WHERE category = $1 AND opted_in = TRUE GROUP BY league ORDER BY league', ['pack_open']);
    console.log('2️⃣ Notification Preferences:', prefs);
    
    // Check profiles with phone numbers
    const { rows: profiles } = await query('SELECT COUNT(*) as count FROM profiles p JOIN notification_preferences np ON np.profile_id = p.id WHERE np.category = $1 AND np.opted_in = TRUE AND COALESCE(p.sms_opt_out_all, FALSE) = FALSE AND p.mobile_e164 IS NOT NULL', ['pack_open']);
    console.log('3️⃣ Ready Profiles:', profiles[0]?.count || 0);
    
    // Check if there are any packs that could be opened
    const { rows: packs } = await query('SELECT id, pack_url, title, league, pack_status, pack_open_time FROM packs WHERE pack_status = $1 ORDER BY pack_open_time ASC LIMIT 5', ['coming-soon']);
    console.log('4️⃣ Coming Soon Packs:', packs);
    
    console.log('\n✅ SMS Integration test complete!');
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

testSMS();
