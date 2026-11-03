/* Animated, accessible presentation for the admin panel's native select controls.
 * The original selects remain the source of truth for existing filters and forms. */
(() => {
  const ids = ['filterBarber', 'filterTime', 'blockBarber', 'blockDuration'];
  const names = {
    filterBarber: 'Майстер',
    filterTime: 'Час',
    blockBarber: 'Майстер',
    blockDuration: 'Тривалість'
  };
  const instances = [];

  function close(instance, restoreFocus = false) {
    instance.root.classList.remove('is-open');
    instance.trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) instance.trigger.focus();
  }

  function sync(instance) {
    const { select, trigger, label, menu } = instance;
    const sourceOptions = [...select.options];
    const selected = sourceOptions.find(option => option.value === select.value) || sourceOptions[0];

    label.textContent = selected ? selected.textContent.trim() : 'Оберіть майстра';
    trigger.setAttribute('aria-label', names[select.id] + ': ' + label.textContent);
    trigger.disabled = !sourceOptions.some(option => !option.disabled);
    menu.replaceChildren();

    sourceOptions.forEach(option => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'admin-select-option';
      item.setAttribute('role', 'option');
      item.tabIndex = -1;
      item.dataset.value = option.value;
      item.textContent = option.textContent;
      item.disabled = option.disabled;
      item.setAttribute('aria-selected', String(option.value === select.value));
      item.addEventListener('click', () => {
        if (option.disabled) return;
        select.value = option.value;
        sync(instance);
        close(instance, true);
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      menu.appendChild(item);
    });
  }

  function open(instance) {
    instances.forEach(other => { if (other !== instance) close(other); });
    sync(instance);
    if (instance.trigger.disabled) return;
    instance.root.classList.add('is-open');
    instance.trigger.setAttribute('aria-expanded', 'true');
    const current = [...instance.menu.querySelectorAll('[role="option"]:not(:disabled)')]
      .find(option => option.getAttribute('aria-selected') === 'true');
    (current || instance.menu.querySelector('[role="option"]:not(:disabled)'))?.focus();
  }

  function add(select) {
    const root = document.createElement('div');
    root.className = 'admin-select';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'admin-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const label = document.createElement('span');
    label.className = 'admin-select-value';
    const chevron = document.createElement('span');
    chevron.className = 'admin-select-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    trigger.append(label, chevron);

    const menu = document.createElement('div');
    menu.id = select.id + '-options';
    menu.className = 'admin-select-menu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', names[select.id]);
    trigger.setAttribute('aria-controls', menu.id);
    root.append(trigger, menu);

    select.insertAdjacentElement('afterend', root);
    select.classList.add('admin-select-native');
    select.setAttribute('aria-hidden', 'true');
    select.tabIndex = -1;

    const instance = { select, root, trigger, label, menu };
    instances.push(instance);
    sync(instance);

    const observer = new MutationObserver(() => sync(instance));
    observer.observe(select, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['disabled', 'label']
    });

    trigger.addEventListener('click', () => {
      if (root.classList.contains('is-open')) close(instance, true);
      else open(instance);
    });

    trigger.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        open(instance);
        if (event.key === 'ArrowUp') {
          const options = [...menu.querySelectorAll('.admin-select-option:not(:disabled)')];
          options[options.length - 1]?.focus();
        }
      }
      if (event.key === 'Escape') close(instance, true);
    });

    menu.addEventListener('keydown', event => {
      const options = [...menu.querySelectorAll('.admin-select-option:not(:disabled)')];
      const current = options.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        close(instance, true);
        return;
      }
      if (event.key === 'Tab') {
        close(instance);
        return;
      }
      let index = -1;
      if (event.key === 'ArrowDown') index = (current + 1) % options.length;
      if (event.key === 'ArrowUp') index = (current - 1 + options.length) % options.length;
      if (event.key === 'Home') index = 0;
      if (event.key === 'End') index = options.length - 1;
      if (index >= 0 && options[index]) {
        event.preventDefault();
        options[index].focus();
      }
    });

    select.addEventListener('change', () => sync(instance));
    root.addEventListener('focusout', event => {
      if (!root.contains(event.relatedTarget)) close(instance);
    });
  }

  ids.forEach(id => {
    const select = document.getElementById(id);
    if (select) add(select);
  });

  document.addEventListener('pointerdown', event => {
    instances.forEach(instance => {
      if (!instance.root.contains(event.target)) close(instance);
    });
  });
  document.getElementById('allBtn')?.addEventListener('click', () => {
    queueMicrotask(() => instances.forEach(sync));
  });
})();
