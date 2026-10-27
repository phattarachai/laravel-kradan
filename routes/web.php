<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Phattarachai\Kradan\Http\Controllers\Api\BoardController;
use Phattarachai\Kradan\Http\Controllers\Api\CommentController;
use Phattarachai\Kradan\Http\Controllers\Api\PickController;
use Phattarachai\Kradan\Http\Controllers\PageController;
use Phattarachai\Kradan\Kradan;

$panels = array_keys(Kradan::panels());

Route::get('/', [PageController::class, 'index'])->name('index');

Route::prefix('api')->name('api.')->group(function (): void {
    Route::get('boards', [BoardController::class, 'index'])->name('boards.index');
    Route::get('boards/{slug}', [BoardController::class, 'show'])->name('boards.show');
    Route::get('boards/{slug}/export.md', [BoardController::class, 'export'])->name('boards.export');
    Route::post('boards/{slug}/heartbeat', [BoardController::class, 'heartbeat'])->name('boards.heartbeat');
    Route::post('boards/{slug}/decide', [BoardController::class, 'decide'])->name('boards.decide');
    Route::put('boards/{slug}/rounds/{number}/picks/{step}', [PickController::class, 'update'])
        ->whereNumber('number')->where('step', '.*')->name('picks.update');
    Route::post('boards/{slug}/rounds/{number}/comments', [CommentController::class, 'store'])
        ->whereNumber('number')->name('comments.store');
    Route::patch('comments/{comment}', [CommentController::class, 'update'])->whereNumber('comment')->name('comments.update');
    Route::delete('comments/{comment}', [CommentController::class, 'destroy'])->whereNumber('comment')->name('comments.destroy');
});

Route::get('{panel}', [PageController::class, 'panel'])->whereIn('panel', $panels)->name('panel');
Route::get('{panel}/{slug}', [PageController::class, 'board'])->whereIn('panel', $panels)->name('board');
