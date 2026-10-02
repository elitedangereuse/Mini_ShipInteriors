// Chat Twitch du cinéma : découpe des lignes IRC reçues.
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chatMessage, emoteParts, parseIrc } from '../shared/twitch-irc.js'

test('un message de chat rend son auteur, sa couleur et son texte', () => {
  const irc = parseIrc('@badge-info=;color=#1E90FF;display-name=Adam\\sFauster;emotes=;id=abc-1;user-id=42 :adam!adam@adam.tmi.twitch.tv PRIVMSG #elitedangereuse :o7 CMDRs : en route')
  assert.equal(irc.command, 'PRIVMSG')
  assert.deepEqual(chatMessage(irc), { id: 'abc-1', userId: '42', name: 'Adam Fauster', color: '#1E90FF', action: false, parts: [{ text: 'o7 CMDRs : en route' }] })
})

test('sans pseudo affiché ni couleur valide, on retombe sur le login', () => {
  const message = chatMessage(parseIrc('@color=red;display-name= :jameson!jameson@x PRIVMSG #c :salut'))
  assert.equal(message.name, 'jameson')
  assert.equal(message.color, '')
})

test('les emotes se découpent en caractères Unicode, les positions fausses sont ignorées', () => {
  assert.deepEqual(emoteParts('🚀 Kappa et Kappa', '25:2-6,11-15'), [{ text: '🚀 ' }, { text: 'Kappa', emote: '25' }, { text: ' et ' }, { text: 'Kappa', emote: '25' }])
  assert.deepEqual(emoteParts('Kappa', '25:0-40/<x>:0-4/25:1-0'), [{ text: 'Kappa' }])
  assert.deepEqual(emoteParts('', ''), [])
})

test('un « /me » perd son enveloppe et garde ses emotes', () => {
  const message = chatMessage(parseIrc('@emotes=25:8-12 :a!a@a PRIVMSG #c :\u0001ACTION Kappa !\u0001'))
  assert.equal(message.action, true)
  assert.deepEqual(message.parts, [{ text: 'Kappa', emote: '25' }, { text: ' !' }])
})

test('les lignes de service se reconnaissent', () => {
  assert.deepEqual(parseIrc('PING :tmi.twitch.tv'), { tags: {}, nick: '', command: 'PING', text: 'tmi.twitch.tv' })
  const clear = parseIrc('@target-user-id=42 :tmi.twitch.tv CLEARCHAT #c :adam')
  assert.equal(clear.command, 'CLEARCHAT')
  assert.equal(clear.tags['target-user-id'], '42')
  assert.equal(parseIrc(':tmi.twitch.tv CLEARCHAT #c').text, '')
  assert.equal(chatMessage(clear), null)
  assert.equal(parseIrc(''), null)
})
