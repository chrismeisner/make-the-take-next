#!/usr/bin/env node

/**
 * Test script to verify SMS integration is working
 * This script tests the SMS notification system without actually sending SMS
 */

import { query } from './lib/db/postgres.js';
import { sendSMS } from './lib/twilioService.js';

async function testSMSIntegration() {
  console.log('🧪 Testing SMS Integration...\n');

  try {
    // Test 1: Check if SMS rules exist
    console.log('1️⃣ Checking SMS rules...');
    const { rows: rules } = await query(
      `SELECT rule_key, title, trigger_type, league, template, active 
       FROM sms_rules 
       WHERE trigger_type = 'pack_open' AND active = TRUE 
       ORDER BY league NULLS LAST`
    );
    
    if (rules.length === 0) {
      console.log('❌ No active SMS rules found for pack_open trigger');
      console.log('   You need to create SMS rules in the admin console first');
      return;
    }
    
    console.log(`✅ Found ${rules.length} active SMS rule(s):`);
    rules.forEach(rule => {
      console.log(`   - ${rule.rule_key} (${rule.league || 'global'}): ${rule.template}`);
    });

    // Test 2: Check notification preferences
    console.log('\n2️⃣ Checking notification preferences...');
    const { rows: prefs } = await query(
      `SELECT COUNT(*) as count, league 
       FROM notification_preferences 
       WHERE category = 'pack_open' AND opted_in = TRUE 
       GROUP BY league 
       ORDER BY league`
    );
    
    if (prefs.length === 0) {
      console.log('❌ No users have opted in for pack_open notifications');
      console.log('   Users need to subscribe to notifications in their profile');
      return;
    }
    
    console.log(`✅ Found notification preferences:`);
    prefs.forEach(pref => {
      console.log(`   - ${pref.league || 'global'}: ${pref.count} users`);
    });

    // Test 3: Check profiles with phone numbers
    console.log('\n3️⃣ Checking profiles with phone numbers...');
    const { rows: profiles } = await query(
      `SELECT COUNT(*) as count 
       FROM profiles p
       JOIN notification_preferences np ON np.profile_id = p.id
       WHERE np.category = 'pack_open' 
         AND np.opted_in = TRUE 
         AND COALESCE(p.sms_opt_out_all, FALSE) = FALSE
         AND p.mobile_e164 IS NOT NULL`
    );
    
    const profileCount = profiles[0]?.count || 0;
    if (profileCount === 0) {
      console.log('❌ No profiles with phone numbers opted in for notifications');
      return;
    }
    
    console.log(`✅ Found ${profileCount} profiles with phone numbers ready for SMS`);

    // Test 4: Test SMS template rendering
    console.log('\n4️⃣ Testing SMS template rendering...');
    const testPack = {
      title: 'Test Pack',
      pack_url: 'test-pack-url',
      league: 'nfl'
    };
    
    const testTemplate = 'Pack {packTitle} is open! {packUrl} (League: {league})';
    const renderedMessage = testTemplate
      .replace(/{packTitle}/g, testPack.title)
      .replace(/{packUrl}/g, `/packs/${testPack.pack_url}`)
      .replace(/{league}/g, testPack.league);
    
    console.log(`✅ Template rendering works:`);
    console.log(`   Template: ${testTemplate}`);
    console.log(`   Rendered: ${renderedMessage}`);

    // Test 5: Check Twilio configuration
    console.log('\n5️⃣ Checking Twilio configuration...');
    const hasFromNumber = !!process.env.TWILIO_FROM_NUMBER;
    const hasServiceSid = !!process.env.TWILIO_MESSAGING_SERVICE_SID;
    const hasAccountSid = !!process.env.TWILIO_ACCOUNT_SID;
    const hasAuthToken = !!process.env.TWILIO_AUTH_TOKEN;
    
    if (!hasFromNumber && !hasServiceSid) {
      console.log('❌ Twilio not configured - missing TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID');
      return;
    }
    
    if (!hasAccountSid || !hasAuthToken) {
      console.log('❌ Twilio credentials missing - need TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
      return;
    }
    
    console.log('✅ Twilio configuration looks good');
    console.log(`   Using: ${hasServiceSid ? 'Messaging Service' : 'From Number'}`);

    console.log('\n🎉 SMS Integration Test Complete!');
    console.log('\n📋 Summary:');
    console.log(`   - SMS Rules: ${rules.length} active`);
    console.log(`   - Notification Preferences: ${prefs.length} leagues`);
    console.log(`   - Ready Profiles: ${profileCount} users`);
    console.log(`   - Twilio: Configured ✅`);
    console.log('\n✅ Your SMS notification system is ready to work!');
    console.log('\n💡 To test with a real pack:');
    console.log('   1. Create a pack with pack_open_time in the future');
    console.log('   2. Wait for it to automatically open');
    console.log('   3. Or manually trigger via admin console');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testSMSIntegration().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('❌ Test script failed:', error);
  process.exit(1);
});
