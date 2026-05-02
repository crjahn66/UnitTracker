#!/usr/bin/env python3
"""Converts spreadsheet data to UnitTracker backup JSON format."""
import json, re
from datetime import datetime

counter = [0]
def gen_id():
    counter[0] += 1
    return f"import-{counter[0]:04d}"

def parse_date(s):
    if not s or not s.strip(): return None
    try:
        m, d, y = [int(x) for x in s.strip().split('/')]
        # Fix obvious year typos
        if y == 2021: y = 2026
        return f"{y:04d}-{m:02d}-{d:02d}T00:00:00.000Z"
    except: return None

def map_component(equip):
    e = equip.lower().strip()
    if any(x in e for x in ['bypass belimo','bypass valve','tank bypass','belimo']):
        return 'bypassValve'
    if any(x in e for x in ['supply isolation','supply iso valve','supply valve']):
        return 'supplyIsoValve'
    if any(x in e for x in ['return isolation','return iso','rtn iso']):
        return 'returnIsoValve'
    if 'isolation valves' in e:  # "both valves" rows go to supplyIso
        return 'supplyIsoValve'
    if any(x in e for x in ['flow meter','flowmeter','supply flow']):
        return 'flowMeter'
    if any(x in e for x in ['flow switch','flow swtich','chiller flow']):
        return 'flowSwitch'
    if any(x in e for x in ['transmitter','transmitters']):
        return 'transmitters'
    if 'gfci' in e:
        return 'gfci'
    if 'field server' in e:
        return 'fieldServer'
    if any(x in e for x in ['plc','in plc']):
        return 'plc'
    return None  # goes to miscEquipment

def build_notes(*parts):
    clean = [p.strip() for p in parts if p and p.strip() and p.strip() not in ('#VALUE!', '')]
    return ' | '.join(clean) if clean else 'See issue log'

def make_issue(date_found, found_by, comp_date, comp_by, how, equip, title, desc, notes, recs):
    comp_key  = map_component(equip)
    full_note = build_notes(title, desc, notes, recs)
    resolved  = bool(comp_date and comp_date.strip())
    df        = parse_date(date_found) or datetime.now().strftime('%Y-%m-%dT00:00:00.000Z')
    issue = {
        'id': gen_id(),
        'dateFound': df,
        'foundBy': (found_by or '').strip(),
        'notes': full_note,
        'resolved': resolved,
    }
    if comp_key:
        issue['componentKey'] = comp_key
    if resolved:
        issue['dateFixed'] = parse_date(comp_date) or df
        issue['fixedBy']   = (comp_by or '').strip()
        issue['howFixed']  = (how or '').strip()
    return issue, comp_key, equip.strip()

def default_components():
    keys = ['supplyIsoValve','returnIsoValve','bypassValve','transmitters',
            'primePump','secondPump','flowMeter','gfci','flowSwitch',
            'chillerInterlocks','fieldServer','plc']
    return {k: {'status': 'unchecked', 'issues': []} for k in keys}

def default_stages():
    return {'wiresLabelsOhming':False,'plcCommChecks':False,'loopChecks':False,'commissioning':False}

# ── Build all 51 units ─────────────────────────────────────────────────────────
units = {}
for i in range(1, 27):
    uid = f"N-{i:02d}"
    units[uid] = {'id':uid,'side':'North','unitNumber':i,'stages':default_stages(),'components':default_components(),'miscEquipment':[]}
for i in range(1, 26):
    uid = f"S-{i:02d}"
    units[uid] = {'id':uid,'side':'South','unitNumber':i,'stages':default_stages(),'components':default_components(),'miscEquipment':[]}

general_issues = []

# ── Row format: (date, by, comp_date, comp_by, how, unit_num, equip, title, desc, add_notes, recs)
# unit_num = "" means general issue

south_rows = [
    ("4/17/2026","Jake Elrod","4/25/2026","Jake Elrod","Equipment Replaced","02","Bypass Belimo Actuator","Recommendation to remount","","",""),
    ("4/24/2026","Jacob Mason","4/28/2026","Jake Elrod","Equipment Replaced","03","Return Isolation Valve","Not functioning correctly","Position feedback does not go below deadband when commanded to close. Put SP to zero and the feedback goes to 5.0x","","Fix the valve"),
    ("4/17/2026","Jake Elrod","4/22/2026","Jake Elrod","Equipment Replaced","03","Bypass Belimo Actuator","Valve is stuck and does not move. Appears to be a physical valve issue.","","Integra fixed valve on 4/20 afternoon. Checked valve on morning of 4/22 and valve is still stuck and unable to be moved either manually or with motor. Still recommend to replace entire valve.","Recommendation to replace valve."),
    ("4/17/2026","Jake Elrod","4/23/2026","Jake Elrod","","04","Supply Flow Meter","No Power","The meter does not have power to the GFCI. The entire 480/120 VAC transformer on the VFD side of the panel that provides power to the Flow meter does not have 480VAC feeding it.","Have electricians check panel wiring and 480 feeders.",""),
    ("4/20/2026","Jordan Deville","4/22/2026","Jake Elrod","Equipment Replaced","04","480 Fuses Missing","Missing fuses on the 480 feed for the 40A DC power supply","Can not power valves for checks.","","Need 480 fuses to continue on checks."),
    ("4/17/2026","Jake Elrod","4/20/2026","Randy Olds","Equipment Replaced","05","Tank Bypass Valve","Needs Remounting","Valves are at a 90 deg offset from piping and Belimo, needs to be on a 45 deg offset from Belimo.","",""),
    ("4/17/2026","Jake Elrod","","","","05","Supply Isolation Valve","Will not take command from PLC","Command from PLC sent to the valve and wiring checked at the valve. Command is being received. No valve movement. Update 4/22/26: Wiring has been double checked and is correct. Signal confirmed to be sending from PLC to valve. Getting flashing green error light on Valve control board. Still recommend replacement.","","Recommendation to replace."),
    ("4/19/2026","Jake Elrod","4/28/2026","Sam Law","Equipment Replaced","06","Isolation Valves","Unable to operate via PLC Command","Both isolation valves will not accept a command from the PLC. Using the manual hand crank we are able to operate the valves however the crank gets stuck in the manual position and will not switch back to remote operation. The valves themselves while in remote operation would not accept the PLC command due to wire corrosion and internal moisture.","",""),
    ("4/17/2026","Jake Elrod","4/19/2026","Jake Elrod","Equipment Replaced","06","Tank Bypass Valve","Needs Remounting","Valves are at a 90 deg offset from piping and Belimo, needs to be on a 45 deg offset from Belimo.","","Recommend remounting"),
    ("4/17/2026","Jake Elrod","4/29/2026","Jake Elrod","Equipment Replaced","06","Supply Isolation Valve","Will not take command from PLC","Command from PLC sent to the valve and wiring checked at the valve. Command is being received. No valve movement.","","Recommendation to replace"),
    ("4/17/2026","Corey Morris","","","","07","Panel AC unit","AC unit will not produce cold air","","",""),
    ("4/17/2026","Jake Elrod","","","","07","Isolation Valves","Heavy Corrosion","Both Return and Supply isolation have heavy corrosion around electrical connection. The return isolation valve started smoking when commanded to operate likely from the heavy corrosive resistance due to water intrusion.","","Recommendation to replace both the Return and Supply Isolation Valves"),
    ("4/20/2026","Jordan Deville","4/20/2026","Mitchell Barras","Equipment Replaced","08","Supply Isolation Valve","Valves stuck in manual operation","Valves stuck in manual operation mechanically. Unable to move via control even when handle in remote position. Valve input had wiring issue. Fixed and wires terminated correctly.","",""),
    ("4/20/2026","Jordan Deville","","","","08","Return Isolation Valve","Valves stuck in manual operation","Valves stuck in manual operation mechanically. Unable to move via control even when handle in remote position.","",""),
    ("4/20/2026","Jordan Deville","","","","08","Supply Flow Meter","Flow Meter Head full of water","When opening the wiring head to troubleshoot lack of power there was significant water and corrosion inside of the meter housing.","","Replace Meter"),
    ("4/17/2026","Jake Elrod","4/23/2026","Jake Elrod","Equipment Replaced","08","Bypass Belimo Actuator","Needs to be installed correctly","Currently cannot be commanded from 0-100","",""),
    ("4/29/2026","Christopher Jahn","4/29/2026","Sam P","Rework by Integra","09","Bypass Belimo Actuator","Arm not set to 45 deg - getting stuck around 40%","","",""),
    ("4/24/2026","Vy Le","4/28/2026","Sam Law","Equipment Replaced","09","Supply Isolation Valve","Will not take command from PLC","Command from PLC sent to the valve and wiring checked at the valve. Command is being received. No valve movement.","",""),
    ("4/17/2026","Jake Elrod","4/25/2026","Jake Elrod","Equipment Replaced","10","Tank Bypass Valve","Backwards install","Belimo is installed on incorrect valve","","Needs to be remounted in correct orientation."),
    ("4/17/2026","Jake Elrod","","","","11","Supply Flow Meter","Faulty Meter","Meter is faulty. Touch buttons do not work and meter can not be configured.","","Recommendation to replace."),
    ("4/17/2026","Jake Elrod","","","","11","Chiller Flow Switch","Flow Switch is non-functional","","","Recommendation to replace."),
    ("4/19/2026","Jordan Deville","","","","12","Chiller Flow Switch","Flow switch non functional","Flow switch was tested during Chiller Interlock test. The switch would not change state during the pump going between run/stop states with observed 875 GPM flow rate. Had Integra Services replace switch and still had the same issue. Checked interlock with physical wiring with no issue however the flow switch does not appear to be working at all in this current install.","","Recommendation to replace."),
    ("4/25/2026","Vy Le","4/28/2026","Jake Elrod","Equipment Replaced","12","Supply Isolation Valve","Will not take command from PLC","Command from PLC sent to the valve and wiring checked at the valve. Command is being received. No valve movement.","",""),
    ("4/17/2026","Jake Elrod","4/25/2026","Jake Elrod","Equipment Replaced","13","Tank Bypass Valve","Needs to be installed correctly","Valves are at a 90 deg offset from piping and Belimo, needs to be on a 45 deg offset from Belimo.","","Recommend remounting"),
    ("4/20/2026","Jordan Deville","","","","13","Return Isolation Valve","Valve appears to be locked up","Valve gets command from PLC and motor attempts to move however the valve does not move. Put the valve in local manual mode and also unable to move the valve with manual hand switch.","","Replace Valve"),
    ("4/20/2026","Jordan Deville","","","","14","Chiller Flow Switch","Not functioning correctly","","",""),
    ("4/17/2026","Jordan Deville","4/29/2026","Randy Olds","Equipment Replaced","15","Supply Isolation Valve","Water in valve","Opened valve cover and valve had over 1 cup of water inside the housing. Water condensation all throughout valve and on terminals. Deemed unsafe to power on. Update 4/23/26: Valve was tested on 4/23/26 and tested fine. Suspect valve still has damage and will fail in the near future.","",""),
    ("4/22/2026","Jordan Deville","4/23/2026","Jake Elrod","Equipment Replaced","15","Supply Primary Temperature Transmitter","Transmitter dead and open loop wire","No display and no electrical feedback","","Transmitter bad, needs replacement"),
    ("4/28/2026","Jake Elrod","","","","15","Supply Flow Meter","Screen not on, water damage","","",""),
    ("4/26/2025","William Yancy","","","","24","PLC Analog Card","Door missing","The actual post for the door is broken. That whole card will have to be changed.","",""),
    # General issues (no unit)
    ("4/19/2026","Derek DiMartino","","","","","Isolation Valves","Incorrect Conduit Installation","Incorrect conduit installation on the isolation valves. The green sealing ring needs to make contact with the valve to create a seal. They did not remove the locking ring used in panels which will not properly seal the penetration that is facing up.","",""),
    ("4/17/2026","Jake Elrod","4/23/2026","Jake Elrod","Rewiring","","In PLC cabinet","0V commons not connected","Wire the 0V to a common point on all three power sources.","",""),
]

north_rows = [
    ("4/22/2026","Vy Le","4/28/2026","Randy O","Equipment Replaced","03","Bypass valve","Broken terminals in Belimo","Terminal arms are broken causing difficulty to terminate wires in Belimo.","",""),
    ("4/26/2026","Vy Le","4/28/2026","Jake Elrod","Equipment Replaced","03","Secondary Pump RTN Press Transmitter","Broken prongs","Contact with transmitter was wrongly installed causing the prongs to bend.","","Transmitter replacement"),
    ("4/26/2026","Vy Le","4/28/2026","Mike E","Recalibration","03","Return ISO Valve","Recalibration needed","Valve needs recalibration. Sending a 0% open, valve stays at 25% Open.","",""),
    ("4/26/2026","Vy Le","","","","03","GFCI Port","No power","No power from GFCI outlet to power flowmeter.","",""),
    ("4/26/2026","Mitchell Barras","","","","06","Chiller Flow Switch","Not functioning correctly","","",""),
    ("4/26/2026","Joey D","","","","09","Cabinet","Water leaking","Water is leaking from the conduit on the bottom right and is leaking into the bottom of the PSK PLC cabinet.","",""),
    ("4/27/2026","Christopher Jahn","","","","15","Bypass valve","Actuator arm not on both valves","","",""),
    ("4/27/2026","Corey Morris","","","","15","Supply Valve","Water damage/non functional","Needs replacement.","",""),
    ("4/27/2026","Christopher Jahn","","","","20","Right door handle","Broken and needs replacement","","",""),
    ("4/28/2026","Christopher Jahn","","","","02","480v switch","Broken, release screw missing","Needs replacement.","",""),
    ("4/28/2026","Christopher Jahn","","","","03","flow switch","Will not make while primary is running","","",""),
    ("4/27/2026","Mitchell Barras","5/1/2026","Christopher Jahn","Integra replaced valve","06","Bypass valve","Doesn't power on, no movement","","",""),
    ("4/30/2026","Devin Morris","","","","01","Bypass valve","Terminal U5 broken","Terminal is broken and will not hold a wire securely.","",""),
    ("5/1/2026","Christopher Jahn","","","","06","Return ISO Valve","Water damage/non functional","","",""),
    # General issues (no unit)
    ("4/28/2026","Christopher Jahn","","","","","Return ISO Valve","Had water in valve cover","","",""),
    ("4/25/2026","Jacob Mason","4/28/2026","Christopher Jahn","Divcon provided field servers","","Field Server","No field server in panel","","",""),
]

def process_rows(rows, side_prefix):
    for row in rows:
        date_found, found_by, comp_date, comp_by, how, unit_num, equip, title, desc, add_notes, recs = row
        issue, comp_key, equip_label = make_issue(date_found, found_by, comp_date, comp_by, how, equip, title, desc, add_notes, recs)

        if not unit_num or not unit_num.strip():
            # No unit number → general issue
            gi = {
                'id': issue['id'],
                'dateFound': issue['dateFound'],
                'foundBy': issue['foundBy'],
                'notes': issue['notes'],
                'resolved': issue['resolved'],
            }
            if issue['resolved']:
                gi['dateFixed'] = issue.get('dateFixed')
                gi['fixedBy']   = issue.get('fixedBy', '')
                gi['howFixed']  = issue.get('howFixed', '')
            general_issues.append(gi)
        else:
            n = int(unit_num.strip())
            uid = f"{side_prefix}-{n:02d}"
            if uid not in units:
                print(f"Warning: unit {uid} not found, skipping")
                continue

            if comp_key:
                # Known component
                comp = units[uid]['components'][comp_key]
                comp['issues'].append(issue)
                all_issues = comp['issues']
                if any(not i['resolved'] for i in all_issues):
                    comp['status'] = 'bad'
                elif all_issues:
                    comp['status'] = 'good'
            else:
                # Misc equipment — find or create item by label
                misc = units[uid]['miscEquipment']
                existing = next((m for m in misc if m['label'].lower() == equip_label.lower()), None)
                if not existing:
                    existing = {
                        'id': gen_id(),
                        'label': equip_label,
                        'status': 'unchecked',
                        'issues': [],
                    }
                    misc.append(existing)
                existing['issues'].append(issue)
                if any(not i['resolved'] for i in existing['issues']):
                    existing['status'] = 'bad'
                elif existing['issues']:
                    existing['status'] = 'good'

process_rows(south_rows, 'S')
process_rows(north_rows, 'N')

output = {
    'version': 1,
    'timestamp': datetime.now().strftime('%Y-%m-%dT%H:%M:%S.000Z'),
    'units': units,
    'generalIssues': general_issues,
}

out_path = '/data/data/com.termux/files/home/storage/downloads/Dicvon/UnitTracker_Import.json'
with open(out_path, 'w') as f:
    json.dump(output, f, indent=2)

# Summary
total_issues = sum(
    len(c['issues'])
    for u in units.values()
    for c in u['components'].values()
) + sum(
    len(m['issues'])
    for u in units.values()
    for m in u['miscEquipment']
)
open_issues  = sum(
    1 for u in units.values()
    for c in u['components'].values()
    for i in c['issues'] if not i['resolved']
) + sum(
    1 for u in units.values()
    for m in u['miscEquipment']
    for i in m['issues'] if not i['resolved']
)
misc_items = sum(len(u['miscEquipment']) for u in units.values())
print(f"Done! Written to {out_path}")
print(f"  Units: {len(units)}")
print(f"  Unit issues: {total_issues} total, {open_issues} open")
print(f"  Misc equipment items: {misc_items}")
print(f"  General issues: {len(general_issues)}")
