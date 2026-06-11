let _mapperDebug = false;
try {
  const stored = window._debugMode;
  if (stored) _mapperDebug = true;
} catch (e) {}

function dbg(...args) {
  if (_mapperDebug || (typeof _popupDebug !== 'undefined' && _popupDebug)) {
    console.log('[JanitorAI Card Backup][DEBUG][v2-mapper]', ...args);
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTaggedSections(description, chatName) {
  dbg('extractTaggedSections called, description length:', (description || '').length, 'chatName:', chatName);

  const result = {
    description: description || '',
    personality: '',
    scenario: '',
    example_dialogs: ''
  };

  if (!result.description) {
    dbg('No description provided, returning empty result');
    return result;
  }

  let cleaned = result.description;

  if (chatName) {
    const escaped = escapeRegex(chatName);
    const personaPattern = new RegExp(
      `<${escaped}'?s?\\s*[Pp]ersona>([\\s\\S]*?)<\\/${escaped}'?s?\\s*[Pp]ersona>`,
      'gi'
    );
    const match = personaPattern.exec(cleaned);
    if (match) {
      dbg('Persona tag found, content length:', match[1].trim().length);
      result.personality = match[1].trim();
      cleaned = cleaned.replace(match[0], '');
    } else {
      dbg('No persona tag found for chatName:', chatName);
    }
  }

  const scenarioPattern = /<scenario>([\s\S]*?)<\/scenario>/gi;
  const scenarioMatch = scenarioPattern.exec(cleaned);
  if (scenarioMatch) {
    dbg('Scenario tag found, content length:', scenarioMatch[1].trim().length);
    result.scenario = scenarioMatch[1].trim();
    cleaned = cleaned.replace(scenarioMatch[0], '');
  } else {
    dbg('No scenario tag found');
  }

  const dialogsPattern = /<example_dialogs>([\s\S]*?)<\/example_dialogs>/gi;
  const dialogsMatch = dialogsPattern.exec(cleaned);
  if (dialogsMatch) {
    dbg('Example dialogs tag found, content length:', dialogsMatch[1].trim().length);
    result.example_dialogs = dialogsMatch[1].trim();
    cleaned = cleaned.replace(dialogsMatch[0], '');
  } else {
    dbg('No example_dialogs tag found');
  }

  result.description = cleaned.trim();
  dbg('Final extracted sections - desc:', result.description.length, 'personality:', result.personality.length, 'scenario:', result.scenario.length, 'dialogs:', result.example_dialogs.length);

  return result;
}

function mapToV2(character) {
  dbg('mapToV2 called for character:', character.name, 'id:', character.id);
  dbg('Input character keys:', Object.keys(character));

  const chatName = character.chat_name || character.name || 'Character';
  const extracted = extractTaggedSections(character.description, chatName);

  const firstMes = (character.first_messages && character.first_messages[0]) || character.first_message || '';
  const altGreetings = (character.first_messages && character.first_messages.slice(1)) || [];
  const personality = character.personality || extracted.personality || '';
  const scenario = character.scenario || extracted.scenario || '';
  const mesExample = character.example_dialogs || extracted.example_dialogs || '';

  dbg('Field sources:');
  dbg('  first_mes from first_messages[0]:', !!(character.first_messages && character.first_messages[0]), 'from first_message:', !character.first_messages?.[0] && !!character.first_message);
  dbg('  personality from char.personality:', !!character.personality, 'from tags:', !character.personality && !!extracted.personality);
  dbg('  scenario from char.scenario:', !!character.scenario, 'from tags:', !character.scenario && !!extracted.scenario);
  dbg('  mes_example from char.example_dialogs:', !!character.example_dialogs, 'from tags:', !character.example_dialogs && !!extracted.example_dialogs);

  const v2 = {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: character.name || character.chat_name || 'Unknown',
      description: extracted.description,
      personality: personality,
      scenario: scenario,
      first_mes: firstMes,
      mes_example: mesExample,
      creator_notes: 'Exported via JanitorAI Card Backup',
      system_prompt: '',
      post_history_instructions: '',
      alternate_greetings: altGreetings,
      character_book: undefined,
      tags: character.is_nsfw ? ['nsfw'] : [],
      creator: '',
      character_version: '',
      extensions: {}
    }
  };

  dbg('V2 card built - name:', v2.data.name, 'desc len:', v2.data.description.length, 'first_mes len:', v2.data.first_mes.length, 'alt greetings:', v2.data.alternate_greetings.length);

  return v2;
}
