// ==UserScript==
// @name         Подсветка ника топик-стартера на qna.habr.com
// @author       dim5x
// @icon         https://raw.githubusercontent.com/dim5x/qna_highlighter/refs/heads/master/silent_user_icon_64x64.ico
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  Подсветка ника топик-стартера по кнопке, если он регулярно не даёт обратную связь по вопросам.
// @match        *://qna.habr.com/q/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      qna.habr.com
// @homepageURL  https://github.com/dim5x/qna_highlighter/tree/master
// @updateURL    https://raw.githubusercontent.com/dim5x/qna_highlighter/refs/heads/master/highlighter.js
// @downloadURL  https://raw.githubusercontent.com/dim5x/qna_highlighter/refs/heads/master/highlighter.js
// @supportURL   https://github.com/dim5x/qna_highlighter/issues
// ==/UserScript==


(function() {
    'use strict';
    console.log('[DEBUG] Скрипт запущен');
    let users = GM_getValue('highlightedUsers', []);
    // 1. Находим ник автора темы и поле для ответа.
    const topic_starter_nick = document.querySelector('div.user-summary__desc span.user-summary__nickname').textContent.trim();
    const answer = document.querySelector('#answer-form');

    console.log(`[DEBUG] ник автора темы: "${topic_starter_nick}"`);
    console.log('[DEBUG] Хранилище:', users);

    // Ищем все элементы, которые могут содержать ники (настраивайте под сайт)
    function highlight_usernames() {
        const elements = document.querySelectorAll('span.user-summary__nickname');
        elements.forEach(el => {
            const username = el.textContent.trim().split(/\s+/)[0];
            if (users.includes(username)) {
                el.style.color = 'red';
                el.style.fontWeight = 'bold';
                answer.hidden = true; // Прячем, если ник в списке.
            }
        });
    }

    // Добавляем span cо статистикой рядом с ником.
    function add_span(questions='', verified='') {
        const topic = document.querySelector('div.user-summary__desc span.user-summary__nickname');
        const span = document.createElement('span');
        span.textContent = `${questions} / ${verified}`;
        span.style.marginLeft = '5px';
        span.style.background = 'none';
        span.style.border = 'none';
        span.style.color = '#999';
        topic.appendChild(span);
    }

    // Добавляем кнопку "➕" рядом с ником.
    function add_button_to_topic_starter() {
        const topicStarterNick = document.querySelector('div.user-summary__desc span.user-summary__nickname');
        topicStarterNick.dataset.hasButton = 'true';

        const button = document.createElement('button');
        button.textContent = '➕';
        button.style.marginLeft = '5px';
        button.style.background = 'none';
        button.style.border = 'none';
        button.style.cursor = 'pointer';
        button.style.color = '#999';

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            if (users.includes(topic_starter_nick)) {
                users = users.filter(user => user !== topic_starter_nick);// Удаляем из списка
                console.log('users поссле удаления:', users);
                topicStarterNick.style.color = '#9099A3'; // Сбрасываем подсветку
                answer.hidden = false; // Современный способ // Восстанавливает исходное значение
            } else {
                users.push(topic_starter_nick); // Добавляем
                console.log('users поссле лобавления:', users);
                highlight_usernames();
            }
            GM_setValue('highlightedUsers', users);
        });

        topicStarterNick.appendChild(button);
    }


    function analyze_habr_profile(username) {
        return new Promise((resolve, reject) => {
            // Удаляем @ из ника, если он есть
            username = username.startsWith('@') ? username.slice(1) : username;
            const profileUrl = `https://qna.habr.com/user/${username}/questions`;

            console.log(`[Habr Analyzer] Загружаем профиль: ${profileUrl}`);

            GM_xmlhttpRequest({
                method: "GET",
                url: profileUrl,
                onload: function(response) {
                    if (response.status !== 200) {
                        const error = new Error(`Ошибка загрузки: ${response.status}`);
                        console.error(`[Habr Analyzer]`, error.message);
                        reject(error);
                        return;
                    }

                    try {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(response.responseText, "text/html");

                        // 1. Получаем количество вопросов
                        const counterElement = doc.querySelector('a.mini-counter div.mini-counter__count');
                        const questionCount = counterElement ? counterElement.textContent.trim() : '0';

                        // 2. Считаем проверенные ответы
                        const verifiedAnswersCount = doc.querySelectorAll('svg.icon_svg.icon_check').length;

                        console.log(`[Habr Analyzer] Статистика для ${username}:`, {
                            questions: questionCount,
                            verified: verifiedAnswersCount
                        });

                        resolve({
                            questions: questionCount,
                            verified: verifiedAnswersCount
                        });

                    } catch (parseError) {
                        console.error('[Habr Analyzer] Ошибка парсинга:', parseError);
                        reject(parseError);
                    }
                },
                onerror: function(error) {
                    console.error('[Habr Analyzer] Ошибка запроса:', error);
                    reject(error);
                }
            });
        });
    }


    function clearStorage(){
        users = [];
        GM_setValue('highlightedUsers', users);
    }

    //clearStorage()

    async function init() {
        const { questions, verified } = await analyze_habr_profile(topic_starter_nick);
        console.log('questions, verified', questions, verified);
        add_span(questions, verified);
        highlight_usernames();
        add_button_to_topic_starter();
    }

    init().catch(console.error);


})();
