// ==UserScript==
// @name         Подсветка ника топик-стартера на qna.habr.com
// @author       dim5x
// @icon         https://raw.githubusercontent.com/dim5x/qna_highlighter/refs/heads/master/w_silent_user_icon_64x64.ico
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  Подсветка ника топик-стартера по кнопке, если он регулярно не даёт обратную связь по вопросам.
// @match        *://qna.habr.com/q/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_listValues
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @connect      qna.habr.com
// @homepageURL  https://github.com/dim5x/qna_highlighter/tree/master
// @updateURL    https://raw.githubusercontent.com/dim5x/qna_highlighter/refs/heads/master/highlighter.js
// @downloadURL  https://raw.githubusercontent.com/dim5x/qna_highlighter/refs/heads/master/highlighter.js
// @supportURL   https://github.com/dim5x/qna_highlighter/issues
// ==/UserScript==


(function () {
    'use strict';
    console.log('[DEBUG] Скрипт запущен!');
    let users = GM_getValue('highlightedUsers', []);
    // 1. Находим ник автора темы и поле для ответа.
    const topic_starter_nick = document.querySelector('div.user-summary__desc span.user-summary__nickname').textContent.trim();
    const answer = document.querySelector('#answer-form');

    console.log(`[DEBUG] Ник автора темы: "${topic_starter_nick}"`);
    console.log('[DEBUG] Хранилище ников:', users);

    // Ищем все элементы, которые могут содержать ники (настраивайте под сайт).
    function highlight_usernames() {
        const elements = document.querySelectorAll('span.user-summary__nickname');
        elements.forEach(el => {
            const username = el.textContent.trim().split(/\s+/)[0];
            if (users.includes(username)) {
                el.style.color = 'red';
                el.style.fontWeight = 'bold';
                answer.hidden = true; // Прячем поле ответа, если ник в списке.
            }
        });
    }

    // Добавляем span со статистикой рядом с ником.
    function add_span(questions = '', verified = '') {
        const topic = document.querySelector('div.user-summary__desc span.user-summary__nickname');
        const span = document.createElement('span');
        span.title = 'всего вопросов / решённых';
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
        // button.style.color = '#999';
        button.style.color = '#9099A3';

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            if (users.includes(topic_starter_nick)) {
                users = users.filter(user => user !== topic_starter_nick);// Удаляем из списка
                console.log(`[DEBUG] Удаляем из списка ${topic_starter_nick}. Список после удаления:`, users);
                topicStarterNick.style.color = '#9099A3'; // Сбрасываем подсветку
                answer.hidden = false; // Современный способ // Восстанавливает исходное значение
            } else {
                users.push(topic_starter_nick); // Добавляем ник в список.
                console.log(`[DEBUG] Добавили  ${topic_starter_nick}. Список после добавления:`, users);
                highlight_usernames();
            }
            GM_setValue('highlightedUsers', users);
        });

        topicStarterNick.appendChild(button);
    }


    function analyze_habr_profile(username) {
        return new Promise((resolve, reject) => {
            username = username.startsWith('@') ? username.slice(1) : username;

            // Конфигурация кэширования
            const CACHE_TTL = 3 * 24 * 60 * 60 * 1000; // 3 дня в миллисекундах
            const CACHE_THRESHOLD = 50; // Минимальное количество вопросов для кэширования
            const cacheKey = `habr_profile_cache_${username}`;

            // Проверка кэша
            const cachedData = GM_getValue(cacheKey);
            console.log('[DEBUG] cachedData:', cachedData);
            if (cachedData && Date.now() - cachedData.data.timestamp < CACHE_TTL) {
                console.log(`[Cache] Используем кэшированные данные для ${username}`);

                resolve({
                    questions: cachedData.data.estimatedQuestionCount,
                    verified: cachedData.data.verified
                });
                return;
            }

            //let allQuestions = 0;
            let allVerified = 0;
            let currentPage = 1;
            let totalPages = 1;
            let questionCount = 0;

            function fetchPage(page) {
                const profileUrl = `https://qna.habr.com/user/${username}/questions?page=${page}`;

                GM_xmlhttpRequest({
                    method: "GET",
                    url: profileUrl,
                    onload: function (response) {
                        if (response.status !== 200) {
                            reject(new Error(`Ошибка загрузки страницы ${page}: ${response.status}`));
                            return;
                        }

                        try {
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(response.responseText, "text/html");

                            if (page === 1) {
                                const countElement = doc.querySelector('a.mini-counter div.mini-counter__count');
                                questionCount = countElement ? parseInt(countElement.textContent.trim()) : 0;
                                totalPages = Math.ceil(questionCount / 20);
                            }

                            // Обработка текущей страницы
                            // const questions = doc.querySelectorAll('.question__title-link');
                            const verified = doc.querySelectorAll('svg.icon_svg.icon_check').length;
                            allVerified += verified;

                            // Проверка продолжения
                            const shouldContinue = () => {
                                const hasNextPage = doc.querySelector('.paginator__item:last-child:not(.paginator__item_current)');
                                const withinCalculatedLimit = page < totalPages;
                                const safetyLimit = page < 50;
                                return (hasNextPage && withinCalculatedLimit && safetyLimit);
                            };

                            if (shouldContinue()) {
                                currentPage++;
                                fetchPage(currentPage);
                            } else {
                                const result = {
                                    //questions: allQuestions.toString(),
                                    estimatedQuestionCount: questionCount,
                                    verified: allVerified,
                                    pages: currentPage,
                                    timestamp: Date.now()
                                };

                                // Кэшируем только если вопросов больше порога
                                if (questionCount > CACHE_THRESHOLD) {
                                    GM_setValue(cacheKey, {
                                        data: result,
                                        //timestamp: Date.now()
                                    });
                                    console.log(`[Cache] Данные сохранены в кэш для ${username}`);
                                } else {
                                    GM_deleteValue(cacheKey); // Удаляем старые данные если они есть
                                }

                                //resolve(result);
                                resolve({
                                    questions: questionCount,
                                    verified: allVerified
                                });
                            }
                        } catch (error) {
                            reject(error);
                        }
                    },
                    onerror: reject
                });
            }

            fetchPage(1);
        });
    }

    // Функция для очистки устаревшего кэша.
    function clear_old_cache() {
        const allKeys = GM_listValues();
        const now = Date.now();
        const CACHE_TTL = 3 * 24 * 60 * 60 * 1000; // 3 дня.
        //const CACHE_TTL = 60 * 1000;

        allKeys.forEach(key => {
            if (key.startsWith('habr_profile_cache_')) {
                const data = GM_getValue(key);
                if (now - data.timestamp > CACHE_TTL) {
                    GM_deleteValue(key);
                }
            }
        });
    }

    // Для полной очистки storage.
    // function clear_storage(){
    //     users = [];
    //     GM_setValue('highlightedUsers', users);
    // }
    //clear_storage()

    async function init() {
        const {questions, verified} = await analyze_habr_profile(topic_starter_nick);
        add_span(questions, verified);
        highlight_usernames();
        add_button_to_topic_starter();
        clear_old_cache(); // Очищаем кэш при запуске скрипта.
    }

    init().catch(console.error);


})();
