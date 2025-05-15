// ==UserScript==
// @name         Подсветка ника топик-стартера на qna.habr.com
// @author       dim5x
// @icon         https://raw.githubusercontent.com/dim5x/qna_highlighter/refs/heads/master/icon.png
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Подсветка ника топик-стартера по кнопке, если он регулярно не даёт обратную связь по вопросам.
// @match        https://qna.habr.com/q/*
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

    // Custom print function.
    function print(...args) {console.log(...args)}

    print('[DEBUG] Скрипт запущен!');
    let users = GM_getValue('highlightedUsers', []);

    // 1. Находим ник автора темы и поле для ответа.
    const topic_starter_nick = document.querySelector('div.user-summary__desc span.user-summary__nickname').textContent.trim();
    const answer = document.querySelector('#answer-form');

    // Конфигурация кэширования
    const CACHE_TTL = 3 * 24 * 60 * 60 * 1000; // 3 дня в миллисекундах
    const CACHE_THRESHOLD = 20; // Минимальное количество вопросов для кэширования
    const cacheKey = `habr_profile_cache_${topic_starter_nick.slice(1)}`;

    print(`[DEBUG] Ник автора темы: "${topic_starter_nick}"`);
    print('[DEBUG] Хранилище ников:', users);

    // Ищем все элементы, которые могут содержать ники (настраивайте под сайт).
    function highlight_usernames() {
        const elements = document.querySelectorAll('span.user-summary__nickname');
        const uniqueElements = new Set(elements); // Автоматически удаляет дубликаты
        uniqueElements.forEach(el => {
            const username = el.textContent.trim().split(/\s+/)[0];
            if (users.includes(username)) {
                el.style.color = 'red';
                el.style.fontWeight = 'bold';
                answer.hidden = true; // Прячем поле ответа, если ник в списке.
            }
        });
    }

    // Добавляем span со статистикой рядом с ником.
    function add_span(questions = 0, verified = 0, without_answer = 0) {
        const topic = document.querySelector('div.user-summary__desc span.user-summary__nickname');
        const span = document.createElement('span');
        const procent = parseInt(`${verified / (questions - without_answer) * 100}`) || 0;
        let color = '#999';

        if (questions > 3){
            switch (true) {
                case procent >= 50:
                    color = "green"; break;
                case procent > 25 && procent < 50:
                    color = "orange"; break;
                case procent >= 0 && procent <= 25:
                    color = "red"; break;
            }
        }

        span.title = `всего задал вопросов  / вопросов без ответа / из имеющих ответ отмечено решёнными ${procent}%`;
        span.textContent = `${questions} / ${without_answer} / ${verified}`;
        span.style.marginLeft = '5px';
        span.style.background = 'none';
        span.style.border = 'none';
        span.style.cursor = 'pointer';
        span.style.color = color;
        span.style.fontWeight = 'bold';
        topic.appendChild(span);
    }

    // Добавляем кнопку "➕" рядом с ником.
    function add_button_to_topic_starter() {
        const topic_starter_nick_div = document.querySelector('div.user-summary__desc span.user-summary__nickname');
        topic_starter_nick_div.dataset.hasButton = 'true';

        const button = document.createElement('button');
        button.textContent = '➕';
        button.style.marginLeft = '5px';
        button.style.background = 'none';
        button.style.border = 'none';
        button.style.cursor = 'pointer';
        button.style.color = '#9099A3';

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            if (users.includes(topic_starter_nick)) {
                users = users.filter(user => user !== topic_starter_nick);// Удаляем из списка
                print(`[DEBUG] Удаляем из списка ${topic_starter_nick}. Список после удаления:`, users);
                topic_starter_nick_div.style.color = '#9099A3'; // Сбрасываем подсветку
                answer.hidden = false; // Современный способ // Восстанавливает исходное значение
            } else {
                users.push(topic_starter_nick); // Добавляем ник в список.
                print(`[DEBUG] Добавили  ${topic_starter_nick}. Список после добавления:`, users);
                highlight_usernames();
            }
            GM_setValue('highlightedUsers', users);
        });

        topic_starter_nick_div.appendChild(button);
    }

    // Анализируем профиль пользователя:
    function analyze_habr_profile(username) {
        return new Promise((resolve, reject) => {
            username = username.startsWith('@') ? username.slice(1) : username;

            // Проверка кэша
            const cachedData = GM_getValue(cacheKey);
            //print('[DEBUG] cachedData:', cachedData);
            if (cachedData && Date.now() - cachedData.data.timestamp < CACHE_TTL) {
                print(`[Cache] Используем кэшированные данные для ${username}`);

                resolve({
                    questions: cachedData.data.estimatedQuestionCount,
                    verified: cachedData.data.verified,
                    without_answer: cachedData.data.without_answer
                });
                return;
            }

            let without_answer = 0;
            let all_verified = 0;
            let current_page = 1;
            let total_pages = 1;
            let question_count = 0;

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

                            // a.mini-counter div.mini-counter__count - селектор для общего количества вопросов.
                            if (page === 1) {
                                const countElement = doc.querySelector('a.mini-counter div.mini-counter__count');
                                question_count = countElement ? parseInt(countElement.textContent.trim()) : 0;
                                total_pages = Math.ceil(question_count / 20);
                            }

                            // Обработка текущей страницы
                            // div.mini-counter__count.mini-counter__count_grey - селектор для количества ответов.
                            const q = doc.querySelectorAll('div.mini-counter__count.mini-counter__count_grey');
                            q.forEach(key => {
                                if (key.textContent.trim() === "0") {
                                    without_answer += 1
                                }
                            });

                            // svg.icon_svg.icon_check - селектор для решённых вопросов.
                            const verified = doc.querySelectorAll('svg.icon_svg.icon_check').length;
                            all_verified += verified;

                            // Проверка продолжения
                            const shouldContinue = () => {
                                const hasNextPage = doc.querySelector('.paginator__item:last-child:not(.paginator__item_current)');
                                const withinCalculatedLimit = page < total_pages;
                                const safetyLimit = page < 50;
                                return (hasNextPage && withinCalculatedLimit && safetyLimit);
                            };

                            if (shouldContinue()) {
                                current_page++;
                                fetchPage(current_page);
                            } else {
                                const result = {
                                    estimatedQuestionCount: question_count,
                                    verified: all_verified,
                                    without_answer: without_answer,
                                    pages: current_page,
                                    timestamp: Date.now()
                                };

                                // Кэшируем только если вопросов больше порога
                                if (question_count > CACHE_THRESHOLD) {
                                    GM_setValue(cacheKey, {
                                        data: result,

                                    });
                                    print(`[Cache] Данные сохранены в кэш для ${username}`);
                                } else {
                                    GM_deleteValue(cacheKey); // Удаляем старые данные если они есть
                                }

                                //resolve(result);
                                resolve({
                                    questions: question_count,
                                    verified: all_verified,
                                    without_answer: without_answer
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
        //const CACHE_TTL = 60 * 1000; // Раскомментировать для очистки немедленно.

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
        const {questions, verified, without_answer} = await analyze_habr_profile(topic_starter_nick);
        add_span(questions, verified, without_answer);
        highlight_usernames();
        add_button_to_topic_starter();
        clear_old_cache(); // Очищаем кэш при запуске скрипта.
    }

    init().catch(console.error);

})();
